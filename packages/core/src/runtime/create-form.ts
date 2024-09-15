import type { CompiledFormModel } from "../model/compiled-form-model.js";
import { getSharedDefaultEnvironment } from "../lifecycle/default-environment.js";
import {
  environmentIdentitiesEqual,
  peekEnvironmentIdentity,
  rememberEnvironmentIdentity,
} from "../lifecycle/environment-identity.js";
import { peekModelEnvironment } from "../lifecycle/model-provenance.js";
import type { CreateFormOptions, FormInstance } from "./contracts.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { runtimeDiagnostic, sortRuntimeDiagnostics } from "./diagnostics.js";
import { FormRuntimeError } from "./error.js";
import { FormRuntime, type FormRuntimeOptions } from "./form-runtime.js";
import { bindFormRuntime } from "./handle.js";
import type { PhaseSet } from "./phases.js";

export interface CreateFormInternals {
  readonly phases?: Partial<PhaseSet>;
  readonly commandLimit?: number;
  readonly iterationLimit?: number;
}

export function createForm(model: CompiledFormModel, options?: CreateFormOptions): FormInstance {
  return instantiateForm(model, options);
}

export function instantiateForm(
  model: CompiledFormModel,
  options?: CreateFormOptions,
  internals?: CreateFormInternals,
): FormInstance {
  if (model === null || typeof model !== "object") {
    throw fail(RUNTIME_DIAGNOSTIC_CODES.INVALID_MODEL, "CompiledFormModel is required");
  }

  const modelIdentity = peekModelEnvironment(model);
  if (modelIdentity === undefined) {
    throw fail(RUNTIME_DIAGNOSTIC_CODES.INVALID_MODEL, "CompiledFormModel is missing runtime provenance");
  }

  const environment = options?.environment ?? getSharedDefaultEnvironment();
  const environmentIdentity =
    peekEnvironmentIdentity(environment) ?? rememberEnvironmentIdentity(environment);
  if (!environmentIdentitiesEqual(modelIdentity, environmentIdentity)) {
    throw fail(
      RUNTIME_DIAGNOSTIC_CODES.ENVIRONMENT_MISMATCH,
      "compile and create must use the same FormEnvironment identity",
    );
  }

  const runtimeOptions: FormRuntimeOptions = {
    ...(options?.initialValues === undefined ? {} : { initialValues: options.initialValues }),
    ...(internals?.phases === undefined ? {} : { phases: internals.phases }),
    ...(internals?.commandLimit === undefined ? {} : { commandLimit: internals.commandLimit }),
    ...(internals?.iterationLimit === undefined ? {} : { iterationLimit: internals.iterationLimit }),
  };
  const runtime = new FormRuntime(model, environment, runtimeOptions);
  bindFormRuntime(runtime.facade, runtime);
  return runtime.facade;
}

function fail(code: (typeof RUNTIME_DIAGNOSTIC_CODES)[keyof typeof RUNTIME_DIAGNOSTIC_CODES], message: string): FormRuntimeError {
  return new FormRuntimeError(sortRuntimeDiagnostics([runtimeDiagnostic({ code, message })]));
}
