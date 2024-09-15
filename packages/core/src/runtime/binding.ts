import type { DataNode } from "../model/data.js";
import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { ModelPath } from "../path/types.js";
import {
  ROOT_INSTANCE_PATH,
  asInstancePath,
  formatInstancePath,
  formatModelPath,
  parseInstancePath,
  type InstancePath,
  type InstancePathLike,
  type InstancePathSegment,
} from "../path/index.js";
import { RUNTIME_DIAGNOSTIC_CODES, type RuntimeDiagnosticCode } from "./diagnostic-codes.js";

export interface BoundInstancePath {
  readonly path: InstancePath;
  readonly segments: readonly InstancePathSegment[];
  readonly modelPath: ModelPath;
  readonly node: DataNode;
}

export type BindFailure = {
  readonly code: RuntimeDiagnosticCode;
  readonly message: string;
  readonly path?: string;
};

export type BindResult =
  | { readonly ok: true; readonly binding: BoundInstancePath }
  | { readonly ok: false; readonly failure: BindFailure };

export function bindInstancePath(model: CompiledFormModel, input: InstancePathLike): BindResult {
  const segments = parseInstancePath(input);
  if (segments === undefined) {
    return {
      ok: false,
      failure: {
        code: RUNTIME_DIAGNOSTIC_CODES.INVALID_PATH,
        message: `Invalid InstancePath: ${String(input)}`,
        path: String(input),
      },
    };
  }

  if (segments.some((segment) => segment.kind === "index")) {
    const path = formatInstancePath(segments);
    return {
      ok: false,
      failure: {
        code: RUNTIME_DIAGNOSTIC_CODES.ARRAY_BINDING_UNAVAILABLE,
        message: "Array item InstancePath binding is not available",
        path,
      },
    };
  }

  const path = formatInstancePath(segments);
  const modelPath = instanceSegmentsToModelPath(segments);
  const node = model.data.nodes.get(modelPath);
  if (node === undefined) {
    return {
      ok: false,
      failure: {
        code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH,
        message: `InstancePath is not bound to the compiled model: ${path}`,
        path,
      },
    };
  }

  return {
    ok: true,
    binding: {
      path,
      segments,
      modelPath,
      node,
    },
  };
}

export function canMaterializeObject(
  model: CompiledFormModel,
  segments: readonly InstancePathSegment[],
): boolean {
  const node =
    segments.length === 0
      ? model.data.root
      : model.data.nodes.get(instanceSegmentsToModelPath(segments));
  if (node === undefined) {
    return false;
  }
  return node.kind === "object" || node.kind === "any" || node.kind === "union" || node.kind === "recursive-ref";
}

export function isFieldPath(model: CompiledFormModel, path: InstancePath): boolean {
  return model.ui.fields.has(path as unknown as ModelPath);
}

export function rootInstancePath(): InstancePath {
  return ROOT_INSTANCE_PATH;
}

export function canonicalRootPath(): InstancePath {
  return asInstancePath("");
}

function instanceSegmentsToModelPath(segments: readonly InstancePathSegment[]): ModelPath {
  return formatModelPath(
    segments.flatMap((segment) => (segment.kind === "property" ? [{ kind: "property" as const, name: segment.name }] : [])),
  );
}
