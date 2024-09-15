import type { DataNode } from "../model/data.js";
import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { ModelPath } from "../path/types.js";
import {
  formatInstancePath,
  parseInstancePath,
  ROOT_INSTANCE_PATH,
  asInstancePath,
  type InstancePath,
  type InstancePathLike,
  type InstancePathSegment,
} from "../path/index.js";
import { RUNTIME_DIAGNOSTIC_CODES, type RuntimeDiagnosticCode } from "./diagnostic-codes.js";
import { indexDataNodes, walkModel } from "./templates.js";

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

  const path = formatInstancePath(segments);
  const walked = walkModel(model, indexDataNodes(model), segments);
  if (!walked.ok) {
    return {
      ok: false,
      failure: {
        code: walked.code,
        message: walked.message,
        path,
      },
    };
  }

  return {
    ok: true,
    binding: {
      path,
      segments,
      modelPath: walked.modelPath,
      node: walked.node,
    },
  };
}

export function canMaterializeObject(
  model: CompiledFormModel,
  segments: readonly InstancePathSegment[],
): boolean {
  const walked = walkModel(model, indexDataNodes(model), segments);
  if (!walked.ok) {
    return false;
  }
  const node = walked.concrete;
  return node.kind === "object" || node.kind === "any" || node.kind === "union" || node.kind === "recursive-ref";
}

export function isFieldPath(model: CompiledFormModel, path: InstancePath): boolean {
  const walked = walkModel(model, indexDataNodes(model), parseInstancePath(path) ?? []);
  if (!walked.ok) {
    return false;
  }
  return model.ui.fields.has(walked.modelPath);
}

export function rootInstancePath(): InstancePath {
  return ROOT_INSTANCE_PATH;
}

export function canonicalRootPath(): InstancePath {
  return asInstancePath("");
}
