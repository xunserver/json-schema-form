import {
  joinInstancePath,
  parseModelPath,
  ROOT_INSTANCE_PATH,
  ROOT_MODEL_PATH,
  toModelPath,
  type InstancePath,
  type ModelPath,
  type ModelPathLike,
} from "../path/index.js";
import { bindTemplatePath, listIndexes, modelPathListCount } from "../path/bind-path.js";
import type { ArrayItemRef, FormInstance, InstanceBinding, RenderScope, ScopedFormInstance } from "./contracts.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { runtimeDiagnostic, sortRuntimeDiagnostics } from "./diagnostics.js";
import { FormRuntimeError } from "./error.js";
import type { FormRuntime } from "./form-runtime.js";
import { bindRuntimeFacade, resolveRuntimeHandle } from "./handle.js";
import type { RuntimeNodeId } from "./runtime-node-id.js";

const SCOPES = new WeakMap<FormRuntime, Map<RuntimeNodeId, RenderScope>>();

export function getRenderScope(target: FormInstance | ScopedFormInstance): RenderScope {
  const handle = resolveRuntimeHandle(target);
  return renderScopeFor(handle.runtime, handle.runtimeId);
}

export function renderScopeFor(runtime: FormRuntime, runtimeId: RuntimeNodeId): RenderScope {
  let byRuntime = SCOPES.get(runtime);
  if (byRuntime === undefined) {
    byRuntime = new Map();
    SCOPES.set(runtime, byRuntime);
  }
  const existing = byRuntime.get(runtimeId);
  if (existing !== undefined) {
    return existing;
  }
  const scope = createRenderScope(runtime, runtimeId);
  byRuntime.set(runtimeId, scope);
  bindRuntimeFacade(scope, runtime, runtimeId);
  return scope;
}

function createRenderScope(runtime: FormRuntime, runtimeId: RuntimeNodeId): RenderScope {
  let last: InstanceBinding = runtime.projectInstanceBinding(runtimeId);
  const scope: RenderScope = {
    get binding(): InstanceBinding {
      last = runtime.projectInstanceBinding(runtimeId, last);
      return last;
    },
    resolve(path) {
      runtime.assertScopeLive(runtimeId);
      last = runtime.projectInstanceBinding(runtimeId, last);
      return resolveModelPath(runtime, last, path);
    },
    item(ref, arrayPath) {
      runtime.assertScopeLive(runtimeId);
      last = runtime.projectInstanceBinding(runtimeId, last);
      const childId = runtime.itemRuntimeIdInScope(runtimeId, ref, arrayPath);
      return renderScopeFor(runtime, childId);
    },
    scope(path) {
      runtime.assertScopeLive(runtimeId);
      last = runtime.projectInstanceBinding(runtimeId, last);
      const childId = runtime.scopeRuntimeIdInScope(runtimeId, path);
      return renderScopeFor(runtime, childId);
    },
  };
  return Object.freeze(scope);
}

export function resolveModelPath(
  runtime: FormRuntime,
  binding: InstanceBinding,
  path: ModelPathLike,
): InstancePath {
  const model = toModelPath(path);
  if (model === undefined) {
    throw fail(RUNTIME_DIAGNOSTIC_CODES.INVALID_PATH, `Path is not a ModelPath: ${String(path)}`, {
      path: String(path),
    });
  }
  if (isAbsoluteTemplate(model, binding.modelPath)) {
    const needed = modelPathListCount(model);
    const available = listIndexes(binding.modelPath, binding.path);
    if (needed > available.length) {
      throw fail(RUNTIME_DIAGNOSTIC_CODES.INVALID_PATH, "ModelPath list slots exceed the current RenderScope chain", {
        path: model,
      });
    }
    return bindTemplatePath(model, binding.modelPath, binding.path);
  }
  return appendRelative(binding.path, model);
}

function isAbsoluteTemplate(template: ModelPath, scopeModel: ModelPath): boolean {
  if (scopeModel === ROOT_MODEL_PATH || template === ROOT_MODEL_PATH) {
    return true;
  }
  const templateSegments = parseModelPath(template) ?? [];
  const scopeSegments = parseModelPath(scopeModel) ?? [];
  const firstTemplate = templateSegments[0];
  const firstScope = scopeSegments[0];
  if (firstTemplate === undefined || firstScope === undefined) {
    return true;
  }
  return sameModelSegment(firstTemplate, firstScope);
}

function sameModelSegment(
  left: { readonly kind: string; readonly name?: string; readonly index?: number },
  right: { readonly kind: string; readonly name?: string; readonly index?: number },
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "property") {
    return left.name === right.name;
  }
  if (left.kind === "tuple") {
    return left.index === right.index;
  }
  return true;
}

function appendRelative(scopePath: InstancePath, relative: ModelPath): InstancePath {
  const segments = parseModelPath(relative) ?? [];
  if (segments.some((segment) => segment.kind === "list")) {
    throw fail(
      RUNTIME_DIAGNOSTIC_CODES.INVALID_PATH,
      "Relative ModelPath with list slots must be entered through item()",
      { path: relative },
    );
  }
  let current = scopePath;
  for (const segment of segments) {
    if (segment.kind === "property") {
      current = joinInstancePath(current, { kind: "property", name: segment.name });
    } else if (segment.kind === "tuple") {
      current = joinInstancePath(current, { kind: "index", index: segment.index });
    }
  }
  return current === ROOT_INSTANCE_PATH && relative === ROOT_MODEL_PATH ? scopePath : current;
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
        ...(metadata === undefined ? {} : { metadata }),
      }),
    ]),
  );
}
