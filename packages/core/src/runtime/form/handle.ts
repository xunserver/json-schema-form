import type { FormInstance, ScopedFormInstance } from "./contracts.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import { runtimeDiagnostic, sortRuntimeDiagnostics } from "../diagnostics.js";
import { FormRuntimeError } from "../error.js";
import type { FormRuntime } from "./form-runtime.js";
import type { RuntimeNodeId } from "./runtime-node-id.js";

export interface RuntimeFacadeHandle {
  readonly runtime: FormRuntime;
  readonly runtimeId: RuntimeNodeId;
}

const FACADES = new WeakMap<object, RuntimeFacadeHandle>();

export function bindFormRuntime(form: FormInstance, runtime: FormRuntime): void {
  bindRuntimeFacade(form, runtime, runtime.rootRuntimeId());
}

export function bindRuntimeFacade(
  target: object,
  runtime: FormRuntime,
  runtimeId: RuntimeNodeId,
): void {
  FACADES.set(target, { runtime, runtimeId });
}

export function resolveFormRuntime(form: FormInstance): FormRuntime {
  return resolveRuntimeHandle(form).runtime;
}

export function resolveRuntimeHandle(target: object): RuntimeFacadeHandle {
  const handle = FACADES.get(target);
  if (handle === undefined) {
    throw new FormRuntimeError(
      sortRuntimeDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.INVALID_MODEL,
          message: "Value is not a FormInstance created by createForm()",
        }),
      ]),
    );
  }
  return handle;
}

export function isRuntimeFacade(target: object): target is FormInstance | ScopedFormInstance {
  return FACADES.has(target);
}
