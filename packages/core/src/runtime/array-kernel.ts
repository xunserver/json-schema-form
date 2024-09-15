import type { ArrayDataNode, DataNode } from "../model/data.js";
import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { ArrayItemId, DataNodeId } from "../identity/index.js";
import {
  formatInstancePath,
  joinInstancePath,
  parseInstancePath,
  ROOT_INSTANCE_PATH,
  type InstancePath,
  type InstancePathLike,
  type InstancePathSegment,
  type ModelPath,
} from "../path/index.js";
import { toModelPath } from "../path/model-path.js";
import type { ArrayItemRef, JsonValue } from "./contracts.js";
import { ArrayStateStore } from "./array-store.js";
import { BindingIndex } from "./binding-index.js";
import {
  derefNode,
  itemTemplate,
  modelSegmentForArrayItem,
  supportsListStructure,
} from "./templates.js";
import type { RuntimeNodeInterner, RuntimeNodeId } from "./runtime-node-id.js";
import { isPlainJsonObject, jsonEqual } from "./json-value.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { runtimeDiagnostic } from "./diagnostics.js";
import { FormRuntimeError } from "./error.js";
import { sortRuntimeDiagnostics } from "./diagnostics.js";
import {
  isSupportedResolverKey,
  type ArrayIdentityResolver,
} from "./identity-resolver.js";
import type { RuntimeSubtreeOwner, SubtreeRemovalReason } from "./subtree-lifecycle.js";

export interface ArrayKernelDraft {
  values: JsonValue;
  arrays: ArrayStateStore;
  bindings: BindingIndex;
  touched: Map<string, true>;
  focused: Map<string, true>;
  identityChanged: boolean;
  orderOnlyArrayPaths: Set<string>;
  affectedEntityValues: Set<string>;
  affectedAddresses: Set<string>;
  affectedArrayOrders: Set<string>;
  removedRuntimeIds: RuntimeNodeId[];
  abortEffects: Array<() => void>;
  generationInvalidations: string[];
  result?: ArrayItemId;
}

export class ArrayKernel {
  constructor(
    readonly model: CompiledFormModel,
    readonly byId: ReadonlyMap<DataNodeId, DataNode>,
    readonly interner: RuntimeNodeInterner,
    readonly resolvers: ReadonlyMap<string, ArrayIdentityResolver>,
    readonly owners: readonly RuntimeSubtreeOwner[],
  ) {}

  internRoot(node: DataNode): RuntimeNodeId {
    return this.interner.intern(["d", node.id]);
  }

  internProperty(parent: RuntimeNodeId, node: DataNode): RuntimeNodeId {
    return this.interner.intern([parent, "p", node.id]);
  }

  internItem(arrayId: RuntimeNodeId, itemId: ArrayItemId, node: DataNode): RuntimeNodeId {
    return this.interner.intern([arrayId, "i", itemId, node.id]);
  }

  materializeTree(
    draft: ArrayKernelDraft,
    node: DataNode,
    runtimeId: RuntimeNodeId,
    value: JsonValue | undefined,
    path: InstancePath,
    parent: RuntimeNodeId | undefined,
    itemId: ArrayItemId | undefined,
  ): void {
    draft.bindings.set(
      { runtimeId, node, modelPath: node.path, parent, itemId },
      path,
    );
    const concrete = derefNode(node, this.byId);
    if (concrete.kind === "object" && isPlainJsonObject(value)) {
      for (const edge of concrete.properties) {
        const childValue = value[edge.name];
        const childPath = joinInstancePath(path, { kind: "property", name: edge.name });
        const childId = this.internProperty(runtimeId, edge.node);
        this.materializeTree(draft, edge.node, childId, childValue, childPath, runtimeId, undefined);
      }
    }
    if (concrete.kind === "array" && Array.isArray(value)) {
      const order: ArrayItemId[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const template = itemTemplate(concrete, index);
        if (template === undefined) {
          continue;
        }
        const allocated = draft.arrays.allocate();
        order.push(allocated);
        const itemPath = joinInstancePath(path, { kind: "index", index });
        const itemRid = this.internItem(runtimeId, allocated, template);
        this.materializeTree(draft, template, itemRid, value[index], itemPath, runtimeId, allocated);
      }
      draft.arrays.setOrder(runtimeId, order);
      draft.identityChanged = true;
      draft.affectedArrayOrders.add(path);
    }
  }

  rebuildAll(draft: ArrayKernelDraft, values: JsonValue): void {
    const previousRoots = [...draft.bindings.records.keys()];
    this.cleanupSubtree(draft, previousRoots, "reset");
    draft.arrays.arrays.clear();
    draft.arrays.itemOwner.clear();
    draft.bindings.pathToId.clear();
    draft.bindings.idToPath.clear();
    draft.bindings.records.clear();
    draft.bindings.children.clear();
    const rootId = this.internRoot(this.model.data.root);
    this.materializeTree(draft, this.model.data.root, rootId, values, ROOT_INSTANCE_PATH, undefined, undefined);
  }

  syncSubtree(
    draft: ArrayKernelDraft,
    node: DataNode,
    runtimeId: RuntimeNodeId,
    previous: JsonValue | undefined,
    next: JsonValue | undefined,
    path: InstancePath,
    parent: RuntimeNodeId | undefined,
    itemId: ArrayItemId | undefined,
    rebuildArrays: boolean,
  ): void {
    draft.bindings.set({ runtimeId, node, modelPath: node.path, parent, itemId }, path);
    const concrete = derefNode(node, this.byId);
    if (concrete.kind === "array") {
      if (!Array.isArray(next)) {
        this.replaceArrayIdentities(draft, concrete, runtimeId, path, Array.isArray(previous) ? previous : [], []);
        return;
      }
      const oldItems = Array.isArray(previous) ? previous : [];
      if (!rebuildArrays && jsonEqual(oldItems, next)) {
        const order = draft.arrays.arrays.get(runtimeId)?.order ?? [];
        for (let index = 0; index < next.length; index += 1) {
          const template = itemTemplate(concrete, index);
          const id = order[index];
          if (template === undefined || id === undefined) {
            continue;
          }
          const itemPath = joinInstancePath(path, { kind: "index", index });
          const itemRid = this.internItem(runtimeId, id, template);
          this.syncSubtree(draft, template, itemRid, oldItems[index], next[index], itemPath, runtimeId, id, false);
        }
        return;
      }
      this.replaceArrayIdentities(draft, concrete, runtimeId, path, oldItems, next);
      return;
    }
    if (concrete.kind === "object") {
      const oldObject = isPlainJsonObject(previous) ? previous : undefined;
      const nextObject = isPlainJsonObject(next) ? next : undefined;
      for (const edge of concrete.properties) {
        const childPath = joinInstancePath(path, { kind: "property", name: edge.name });
        const childId = this.internProperty(runtimeId, edge.node);
        this.syncSubtree(
          draft,
          edge.node,
          childId,
          oldObject?.[edge.name],
          nextObject?.[edge.name],
          childPath,
          runtimeId,
          undefined,
          rebuildArrays,
        );
      }
    }
  }

  replaceArrayIdentities(
    draft: ArrayKernelDraft,
    array: ArrayDataNode,
    arrayRid: RuntimeNodeId,
    path: InstancePath,
    previous: readonly JsonValue[],
    next: readonly JsonValue[],
    forceNew = false,
  ): void {
    const oldOrder = [...(draft.arrays.arrays.get(arrayRid)?.order ?? [])];
    const resolver = forceNew ? undefined : this.resolvers.get(path) ?? this.resolvers.get(array.path);
    let reused: Array<ArrayItemId | undefined> = next.map(() => undefined);

    if (resolver !== undefined) {
      reused = this.reconcile(resolver, previous, next, oldOrder, path);
    }

    const removed: ArrayItemId[] = [];
    const reusedSet = new Set(reused.filter((item): item is ArrayItemId => item !== undefined));
    for (const id of oldOrder) {
      if (!reusedSet.has(id)) {
        removed.push(id);
      }
    }
    for (const id of removed) {
      const itemRid = this.itemRuntimeId(draft, arrayRid, id);
      if (itemRid !== undefined) {
        this.cleanupSubtree(draft, [itemRid], "whole-array");
      }
    }

    const order: ArrayItemId[] = [];
    for (let index = 0; index < next.length; index += 1) {
      const template = itemTemplate(array, index);
      if (template === undefined) {
        continue;
      }
      const existing = reused[index];
      const id = existing ?? draft.arrays.allocate();
      order.push(id);
      const itemPath = joinInstancePath(path, { kind: "index", index });
      const itemRid = this.internItem(arrayRid, id, template);
      if (existing === undefined) {
        this.materializeTree(draft, template, itemRid, next[index], itemPath, arrayRid, id);
      } else {
        const oldIndex = oldOrder.indexOf(existing);
        this.syncSubtree(
          draft,
          template,
          itemRid,
          oldIndex >= 0 ? previous[oldIndex] : undefined,
          next[index],
          itemPath,
          arrayRid,
          id,
          false,
        );
        draft.affectedAddresses.add(id);
        draft.affectedEntityValues.add(id);
      }
    }
    draft.arrays.setOrder(arrayRid, order);
    draft.identityChanged = true;
    draft.affectedArrayOrders.add(path);
  }

  reconcile(
    resolver: ArrayIdentityResolver,
    previous: readonly JsonValue[],
    next: readonly JsonValue[],
    oldOrder: readonly ArrayItemId[],
    path: InstancePath,
  ): Array<ArrayItemId | undefined> {
    const oldKeys: Array<string | number | undefined> = [];
    const newKeys: Array<string | number | undefined> = [];
    for (let index = 0; index < previous.length; index += 1) {
      oldKeys.push(this.evalResolver(resolver, previous[index], path, "old", index));
    }
    for (let index = 0; index < next.length; index += 1) {
      newKeys.push(this.evalResolver(resolver, next[index], path, "new", index));
    }
    this.assertUniqueKeys(oldKeys, path, "old");
    this.assertUniqueKeys(newKeys, path, "new");
    const oldByKey = new Map<string | number, ArrayItemId>();
    for (let index = 0; index < oldKeys.length; index += 1) {
      const key = oldKeys[index];
      const id = oldOrder[index];
      if (key !== undefined && id !== undefined) {
        oldByKey.set(key, id);
      }
    }
    const used = new Set<ArrayItemId>();
    return newKeys.map((key) => {
      if (key === undefined) {
        return undefined;
      }
      const id = oldByKey.get(key);
      if (id === undefined || used.has(id)) {
        return undefined;
      }
      used.add(id);
      return id;
    });
  }

  evalResolver(
    resolver: ArrayIdentityResolver,
    item: JsonValue | undefined,
    path: InstancePath,
    side: "old" | "new",
    index: number,
  ): string | number | undefined {
    let result: unknown;
    try {
      result = resolver(item as JsonValue);
    } catch {
      throw fail(
        RUNTIME_DIAGNOSTIC_CODES.IDENTITY_RESOLVER_FAILED,
        "Array identity resolver failed",
        { path, reason: "threw", side, index },
      );
    }
    if (result === undefined) {
      return undefined;
    }
    if (!isSupportedResolverKey(result)) {
      throw fail(
        RUNTIME_DIAGNOSTIC_CODES.IDENTITY_RESOLVER_FAILED,
        "Array identity resolver returned an unsupported key",
        { path, reason: "unsupported-result", side, index },
      );
    }
    return result;
  }

  assertUniqueKeys(
    keys: readonly (string | number | undefined)[],
    path: InstancePath,
    side: "old" | "new",
  ): void {
    const seen = new Set<string | number>();
    for (const key of keys) {
      if (key === undefined) {
        continue;
      }
      if (seen.has(key)) {
        throw fail(
          RUNTIME_DIAGNOSTIC_CODES.IDENTITY_RESOLVER_FAILED,
          "Array identity resolver produced a duplicate key",
          { path, reason: "duplicate-key", side },
        );
      }
      seen.add(key);
    }
  }

  itemRuntimeId(draft: ArrayKernelDraft, arrayRid: RuntimeNodeId, itemId: ArrayItemId): RuntimeNodeId | undefined {
    for (const [id, record] of draft.bindings.records) {
      if (record.itemId === itemId && record.parent === arrayRid) {
        return id;
      }
    }
    const arrayPath = draft.bindings.pathOf(arrayRid);
    const order = draft.arrays.arrays.get(arrayRid)?.order ?? [];
    const index = order.indexOf(itemId);
    if (arrayPath === undefined || index < 0) {
      return undefined;
    }
    return draft.bindings.idAt(joinInstancePath(arrayPath, { kind: "index", index }));
  }

  cleanupSubtree(draft: ArrayKernelDraft, roots: readonly RuntimeNodeId[], reason: SubtreeRemovalReason): void {
    const removed: RuntimeNodeId[] = [];
    for (const root of roots) {
      if (!draft.bindings.records.has(root)) {
        continue;
      }
      const tree = draft.bindings.removeTree(root);
      removed.push(...tree);
    }
    const removedSet = new Set(removed);
    for (const id of removed) {
      draft.arrays.removeArray(id);
      draft.touched.delete(id);
      for (const key of [...draft.focused.keys()]) {
        if (key === id || key.startsWith(`${id}::`)) {
          draft.focused.delete(key);
        }
      }
    }
    for (const [itemId, owner] of [...draft.arrays.itemOwner.entries()]) {
      if (removedSet.has(owner)) {
        draft.arrays.itemOwner.delete(itemId);
      }
    }
    draft.removedRuntimeIds.push(...removed);
    draft.identityChanged = true;
    if (removed.length === 0) {
      return;
    }
    const descriptor = Object.freeze({
      reason,
      roots,
      descendants: Object.freeze([...removed]),
    });
    for (const owner of this.owners) {
      const plan = owner.plan(descriptor);
      draft.abortEffects.push(...plan.abortEffects);
      draft.generationInvalidations.push(...plan.generationInvalidations);
    }
  }

  resolveItemIndex(draft: ArrayKernelDraft, arrayRid: RuntimeNodeId, ref: ArrayItemRef, path: InstancePath): number {
    const order = draft.arrays.arrays.get(arrayRid)?.order ?? [];
    if (typeof ref === "number") {
      if (!Number.isInteger(ref) || ref < 0 || ref >= order.length) {
        throw fail(RUNTIME_DIAGNOSTIC_CODES.ARRAY_INDEX_OUT_OF_RANGE, "Array index is out of range", {
          path,
          index: ref,
        });
      }
      return ref;
    }
    const owner = draft.arrays.itemOwner.get(ref);
    if (owner === undefined) {
      throw fail(RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_ARRAY_ITEM, "Array item id is unknown", {
        path,
        item: String(ref),
      });
    }
    if (owner !== arrayRid) {
      throw fail(RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_ARRAY_ITEM, "Array item id is not owned by the target array", {
        path,
        item: String(ref),
      });
    }
    const index = order.indexOf(ref);
    if (index < 0) {
      throw fail(RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_ARRAY_ITEM, "Array item id is unknown", {
        path,
        item: String(ref),
      });
    }
    return index;
  }

  requireArray(
    draft: ArrayKernelDraft,
    path: InstancePathLike,
    allowInsertEnd = false,
  ): {
    runtimeId: RuntimeNodeId;
    node: ArrayDataNode;
    path: InstancePath;
    segments: readonly InstancePathSegment[];
  } {
    const resolved = this.requireBinding(draft, path);
    const concrete = derefNode(resolved.node, this.byId);
    if (concrete.kind !== "array") {
      throw fail(RUNTIME_DIAGNOSTIC_CODES.NON_ARRAY_PATH, "Path does not identify an array", {
        path: resolved.path,
      });
    }
    void allowInsertEnd;
    return {
      runtimeId: resolved.runtimeId,
      node: concrete,
      path: resolved.path,
      segments: resolved.segments,
    };
  }

  requireList(draft: ArrayKernelDraft, path: InstancePathLike) {
    const array = this.requireArray(draft, path);
    if (!supportsListStructure(array.node)) {
      throw fail(
        RUNTIME_DIAGNOSTIC_CODES.ARRAY_SHAPE_UNSUPPORTED,
        "Array shape does not support list structure commands",
        { path: array.path, command: "structure" },
      );
    }
    return array;
  }

  requireBinding(
    draft: ArrayKernelDraft,
    path: InstancePathLike,
  ): {
    runtimeId: RuntimeNodeId;
    node: DataNode;
    path: InstancePath;
    segments: readonly InstancePathSegment[];
    modelPath: ModelPath;
  } {
    const segments = parseInstancePath(path);
    if (segments === undefined) {
      throw fail(RUNTIME_DIAGNOSTIC_CODES.INVALID_PATH, `Invalid InstancePath: ${String(path)}`, {
        path: String(path),
      });
    }
    const formatted = formatInstancePath(segments);
    let node: DataNode = this.model.data.root;
    let runtimeId = this.internRoot(node);
    let currentPath = ROOT_INSTANCE_PATH;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!;
      const concrete = derefNode(node, this.byId);
      if (segment.kind === "property") {
        if (concrete.kind !== "object") {
          throw fail(RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH, "InstancePath is not bound to the compiled model", {
            path: formatted,
          });
        }
        const edge = concrete.properties.find((item) => item.name === segment.name);
        if (edge === undefined) {
          throw fail(RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH, "InstancePath is not bound to the compiled model", {
            path: formatted,
          });
        }
        currentPath = joinInstancePath(currentPath, segment);
        runtimeId = this.internProperty(runtimeId, edge.node);
        node = edge.node;
        continue;
      }
      if (concrete.kind !== "array") {
        throw fail(RUNTIME_DIAGNOSTIC_CODES.NON_ARRAY_PATH, "InstancePath indexes a non-array node", {
          path: formatted,
        });
      }
      const value = getArrayLength(draft.values, parseInstancePath(currentPath) ?? []);
      if (segment.index < 0 || segment.index >= value) {
        throw fail(RUNTIME_DIAGNOSTIC_CODES.ARRAY_INDEX_OUT_OF_RANGE, "Array index is out of range", {
          path: formatted,
          index: segment.index,
        });
      }
      const template = itemTemplate(concrete, segment.index);
      if (template === undefined) {
        throw fail(
          RUNTIME_DIAGNOSTIC_CODES.ARRAY_TEMPLATE_MISSING,
          "Array index does not map to a compiled item template",
          { path: formatted, index: segment.index },
        );
      }
      const order = draft.arrays.arrays.get(runtimeId)?.order ?? [];
      const itemId = order[segment.index];
      if (itemId === undefined) {
        throw fail(RUNTIME_DIAGNOSTIC_CODES.ARRAY_INDEX_OUT_OF_RANGE, "Array index is out of range", {
          path: formatted,
          index: segment.index,
        });
      }
      currentPath = joinInstancePath(currentPath, segment);
      runtimeId = this.internItem(runtimeId, itemId, template);
      node = template;
    }
    return {
      runtimeId,
      node,
      path: formatted,
      segments,
      modelPath: node.path,
    };
  }

  readdressArray(draft: ArrayKernelDraft, arrayRid: RuntimeNodeId): void {
    const arrayPath = draft.bindings.pathOf(arrayRid);
    const record = draft.bindings.records.get(arrayRid);
    if (arrayPath === undefined || record === undefined) {
      return;
    }
    const array = derefNode(record.node, this.byId);
    if (array.kind !== "array") {
      return;
    }
    const order = draft.arrays.arrays.get(arrayRid)?.order ?? [];
    for (let index = 0; index < order.length; index += 1) {
      const itemId = order[index]!;
      const template = itemTemplate(array, index);
      if (template === undefined) {
        continue;
      }
      const itemRid = this.internItem(arrayRid, itemId, template);
      const itemPath = joinInstancePath(arrayPath, { kind: "index", index });
      this.readdressTree(draft, itemRid, itemPath);
      draft.affectedAddresses.add(itemId);
    }
    draft.affectedArrayOrders.add(arrayPath);
  }

  readdressTree(draft: ArrayKernelDraft, runtimeId: RuntimeNodeId, path: InstancePath): void {
    const oldPath = draft.bindings.pathOf(runtimeId);
    if (oldPath === undefined) {
      draft.bindings.readdress(runtimeId, path);
      return;
    }
    const nodes = [runtimeId, ...draft.bindings.descendants(runtimeId)];
    for (const id of nodes) {
      const current = draft.bindings.pathOf(id);
      if (current === undefined) {
        continue;
      }
      draft.bindings.readdress(id, rewriteInstancePrefix(current, oldPath, path));
    }
  }
}

export function joinRelativePath(base: InstancePath, relative?: InstancePathLike): InstancePath {
  if (relative === undefined || relative === "") {
    return base;
  }
  const extra = parseInstancePath(relative);
  if (extra === undefined) {
    return base;
  }
  const baseSegments = parseInstancePath(base) ?? [];
  return formatInstancePath([...baseSegments, ...extra]);
}

function rewriteInstancePrefix(path: InstancePath, oldPrefix: InstancePath, nextPrefix: InstancePath): InstancePath {
  if (path === oldPrefix) {
    return nextPrefix;
  }
  const pathSegments = parseInstancePath(path) ?? [];
  const oldSegments = parseInstancePath(oldPrefix) ?? [];
  const nextSegments = parseInstancePath(nextPrefix) ?? [];
  if (pathSegments.length < oldSegments.length) {
    return path;
  }
  for (let index = 0; index < oldSegments.length; index += 1) {
    if (!sameSegment(pathSegments[index], oldSegments[index])) {
      return path;
    }
  }
  return formatInstancePath([...nextSegments, ...pathSegments.slice(oldSegments.length)]);
}

function sameSegment(left: InstancePathSegment | undefined, right: InstancePathSegment | undefined): boolean {
  if (left === undefined || right === undefined) {
    return false;
  }
  if (left.kind === "index" && right.kind === "index") {
    return left.index === right.index;
  }
  if (left.kind === "property" && right.kind === "property") {
    return left.name === right.name;
  }
  return false;
}

function getArrayLength(root: JsonValue, segments: readonly InstancePathSegment[]): number {
  let current: unknown = root;
  for (const segment of segments) {
    if (current === undefined || current === null) {
      return 0;
    }
    if (segment.kind === "index") {
      if (!Array.isArray(current)) {
        return 0;
      }
      current = current[segment.index];
      continue;
    }
    if (typeof current !== "object" || Array.isArray(current)) {
      return 0;
    }
    current = (current as Record<string, unknown>)[segment.name];
  }
  return Array.isArray(current) ? current.length : 0;
}

function fail(
  code: (typeof RUNTIME_DIAGNOSTIC_CODES)[keyof typeof RUNTIME_DIAGNOSTIC_CODES],
  message: string,
  metadata?: Readonly<Record<string, unknown>>,
): FormRuntimeError {
  return new FormRuntimeError(
    sortRuntimeDiagnostics([
      runtimeDiagnostic({
        code,
        message,
        ...(metadata === undefined ? {} : { metadata: sanitizeMetadata(metadata) }),
      }),
    ]),
  );
}

export function sanitizeMetadata(
  metadata: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key === "exception" || key === "RuntimeNodeId" || key === "store" || key === "draft") {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      next[key] = value;
    }
  }
  return Object.freeze(next);
}

export function throwRuntime(
  code: (typeof RUNTIME_DIAGNOSTIC_CODES)[keyof typeof RUNTIME_DIAGNOSTIC_CODES],
  message: string,
  metadata?: Readonly<Record<string, unknown>>,
): never {
  throw fail(code, message, metadata);
}

void toModelPath;
void modelSegmentForArrayItem;
