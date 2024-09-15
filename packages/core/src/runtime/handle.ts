import type { FormInstance } from "./contracts.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { runtimeDiagnostic, sortRuntimeDiagnostics } from "./diagnostics.js";
import { FormRuntimeError } from "./error.js";
import type { FormRuntime } from "./form-runtime.js";

const RUNTIMES = new WeakMap<FormInstance, FormRuntime>();

export function bindFormRuntime(form: FormInstance, runtime: FormRuntime): void {
  RUNTIMES.set(form, runtime);
}

export function resolveFormRuntime(form: FormInstance): FormRuntime {
  const runtime = RUNTIMES.get(form);
  if (runtime === undefined) {
    throw new FormRuntimeError(
      sortRuntimeDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.INVALID_MODEL,
          message: "Value is not a FormInstance created by createForm()",
        }),
      ]),
    );
  }
  return runtime;
}
