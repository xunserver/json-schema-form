import type { ArrayDataNode, DataNode } from "../model/data.js";
import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { DataNodeId } from "../identity/index.js";
import {
  formatModelPath,
  joinModelPath,
  parseModelPath,
  ROOT_MODEL_PATH,
  type ModelPath,
  type ModelPathSegment,
} from "../path/index.js";
import type { InstancePathSegment } from "../path/index.js";
import { RUNTIME_DIAGNOSTIC_CODES, type RuntimeDiagnosticCode } from "./diagnostic-codes.js";

export function indexDataNodes(model: CompiledFormModel): ReadonlyMap<DataNodeId, DataNode> {
  const index = new Map<DataNodeId, DataNode>();
  for (const node of model.data.nodes.values()) {
    index.set(node.id, node);
  }
  index.set(model.data.root.id, model.data.root);
  return index;
}

export function derefNode(node: DataNode, byId: ReadonlyMap<DataNodeId, DataNode>): DataNode {
  if (node.kind !== "recursive-ref") {
    return node;
  }
  return byId.get(node.targetId) ?? node;
}

export function itemTemplate(array: ArrayDataNode, index: number): DataNode | undefined {
  const prefix = array.prefixItems ?? [];
  if (index < prefix.length) {
    return prefix[index];
  }
  return array.items;
}

export function supportsListStructure(array: ArrayDataNode): boolean {
  return array.form === "list" && array.items !== undefined;
}

export function modelSegmentForArrayItem(array: ArrayDataNode, index: number): ModelPathSegment {
  const prefix = array.prefixItems ?? [];
  if (array.form === "tuple" && index < prefix.length) {
    return { kind: "tuple", index };
  }
  return { kind: "list" };
}

export interface ModelWalkSuccess {
  readonly ok: true;
  readonly node: DataNode;
  readonly modelPath: ModelPath;
  readonly concrete: DataNode;
}

export interface ModelWalkFailure {
  readonly ok: false;
  readonly code: RuntimeDiagnosticCode;
  readonly message: string;
}

export type ModelWalkResult = ModelWalkSuccess | ModelWalkFailure;

export function walkModel(
  model: CompiledFormModel,
  byId: ReadonlyMap<DataNodeId, DataNode>,
  segments: readonly InstancePathSegment[],
): ModelWalkResult {
  let node: DataNode = model.data.root;
  let modelPath: ModelPath = ROOT_MODEL_PATH;
  for (const segment of segments) {
    const concrete = derefNode(node, byId);
    if (segment.kind === "property") {
      if (concrete.kind !== "object") {
        return {
          ok: false,
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH,
          message: "InstancePath is not bound to the compiled model",
        };
      }
      const edge = concrete.properties.find((item) => item.name === segment.name);
      if (edge === undefined) {
        return {
          ok: false,
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH,
          message: "InstancePath is not bound to the compiled model",
        };
      }
      modelPath = joinModelPath(modelPath, { kind: "property", name: segment.name });
      node = edge.node;
      continue;
    }

    if (concrete.kind !== "array") {
      return {
        ok: false,
        code: RUNTIME_DIAGNOSTIC_CODES.NON_ARRAY_PATH,
        message: "InstancePath indexes a non-array node",
      };
    }
    const template = itemTemplate(concrete, segment.index);
    if (template === undefined) {
      return {
        ok: false,
        code: RUNTIME_DIAGNOSTIC_CODES.ARRAY_TEMPLATE_MISSING,
        message: "Array index does not map to a compiled item template",
      };
    }
    modelPath = joinModelPath(modelPath, modelSegmentForArrayItem(concrete, segment.index));
    node = template;
  }
  return {
    ok: true,
    node,
    modelPath,
    concrete: derefNode(node, byId),
  };
}

export function parseModelSegments(path: ModelPath): readonly ModelPathSegment[] {
  return parseModelPath(path) ?? [];
}

export { formatModelPath };
