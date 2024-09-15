import { splitJsonPointer } from "../../compiler/schema/pointer.js";
import {
  escapeJsonPointerToken,
  formatInstancePath,
  parseInstancePath,
  ROOT_INSTANCE_PATH,
  type InstancePath,
  type InstancePathSegment,
} from "../../model/path/index.js";
import { objectPropertyEdges } from "../../model/data/data.js";
import type { BindingIndex, BindingRecord } from "../dependency/binding-index.js";
import { derefNode, indexDataNodes } from "../templates.js";
import type { RuntimeNodeId } from "../form/runtime-node-id.js";
import type { CompiledFormModel } from "../../model/compiled-form-model.js";

export interface PointerBinding {
  readonly runtimeId: RuntimeNodeId;
  readonly path: InstancePath;
  readonly record: BindingRecord;
}

export function resolveJsonPointerBinding(
  pointer: string,
  bindings: BindingIndex,
  model: CompiledFormModel,
  missingProperty?: string,
): PointerBinding | undefined {
  const tokens = [...splitJsonPointer(pointer)];
  if (missingProperty !== undefined) {
    tokens.push(missingProperty);
  }
  const rootId = bindings.idAt(ROOT_INSTANCE_PATH);
  if (rootId === undefined) {
    return undefined;
  }
  const byId = indexDataNodes(model);
  let runtimeId = rootId;
  let record = bindings.records.get(runtimeId);
  if (record === undefined) {
    return undefined;
  }
  const segments: InstancePathSegment[] = [];
  for (const token of tokens) {
    const concrete = derefNode(record.node, byId);
    if (concrete.kind === "array") {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || String(index) !== token) {
        return undefined;
      }
      segments.push({ kind: "index", index });
    } else {
      const edge = objectPropertyEdges(concrete).find((item) => item.name === token);
      if (edge === undefined && concrete.kind !== "any") {
        return undefined;
      }
      segments.push({ kind: "property", name: token });
    }
    const nextPath = formatInstancePath(segments);
    const nextId = bindings.idAt(nextPath);
    if (nextId === undefined) {
      return undefined;
    }
    runtimeId = nextId;
    record = bindings.records.get(runtimeId);
    if (record === undefined) {
      return undefined;
    }
  }
  const path = tokens.length === 0 ? ROOT_INSTANCE_PATH : formatInstancePath(segments);
  return { runtimeId, path, record };
}

export function isJsonPointer(value: string): boolean {
  return value === "" || value.startsWith("/");
}

export function instancePathToJsonPointer(path: InstancePath): string {
  const segments = parseInstancePath(path) ?? [];
  if (segments.length === 0) {
    return "";
  }
  return `/${segments
    .map((segment) => escapeJsonPointerToken(segment.kind === "index" ? String(segment.index) : segment.name))
    .join("/")}`;
}
