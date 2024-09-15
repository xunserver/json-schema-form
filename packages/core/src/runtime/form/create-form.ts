import type { CompiledFormModel } from "../../model/compiled-form-model.js";
import { getSharedDefaultEnvironment } from "../../engine/default-environment.js";
import {
  environmentIdentitiesEqual,
  peekEnvironmentIdentity,
  rememberEnvironmentIdentity,
} from "../../engine/environment-identity.js";
import { peekModelEnvironment } from "../../engine/model-provenance.js";
import type { CreateFormOptions, FormInstance } from "./contracts.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import { runtimeDiagnostic, sortRuntimeDiagnostics } from "../diagnostics.js";
import { FormRuntimeError } from "../error.js";
import { FormRuntime, type FormRuntimeOptions } from "./form-runtime.js";
import { bindFormRuntime } from "./handle.js";
import type { RuntimeSubtreeOwner } from "./subtree-lifecycle.js";
import type { PhaseSet } from "../transaction/phases.js";
import type { AffectedValidationRulePlan } from "../rule/engine.js";
import { cloneJsonValue, JsonCloneError } from "../value/json-value.js";
import { resolveValueInitializerKey, runValueInitializer } from "../value/value-initializer.js";
import type { JsonValue } from "./contracts.js";

export interface CreateFormInternals {
  readonly phases?: Partial<PhaseSet>;
  readonly commandLimit?: number;
  readonly iterationLimit?: number;
  readonly subtreeOwners?: readonly RuntimeSubtreeOwner[];
  readonly validationOwner?: (plan: AffectedValidationRulePlan) => void;
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

  const initializerKey = resolveValueInitializerKey(model, options?.valueInitializer);
  let initialValues = options?.initialValues;
  if (initializerKey !== undefined) {
    let provided: JsonValue | undefined;
    if (options?.initialValues !== undefined) {
      try {
        provided = cloneJsonValue(options.initialValues);
      } catch (error) {
        const reason = error instanceof JsonCloneError ? error.reason : "non-json";
        throw fail(
          RUNTIME_DIAGNOSTIC_CODES.INVALID_VALUE,
          "initialValues is not a JSON-compatible snapshot",
          { reason },
        );
      }
    }
    initialValues = runValueInitializer(initializerKey, provided, model, environment);
  }

  const runtimeOptions: FormRuntimeOptions = {
    ...(initialValues === undefined ? {} : { initialValues }),
    ...(options?.arrayIdentityResolvers === undefined
      ? {}
      : { arrayIdentityResolvers: options.arrayIdentityResolvers }),
    ...(internals?.phases === undefined ? {} : { phases: internals.phases }),
    ...(internals?.commandLimit === undefined ? {} : { commandLimit: internals.commandLimit }),
    ...(internals?.iterationLimit === undefined ? {} : { iterationLimit: internals.iterationLimit }),
    ...(internals?.subtreeOwners === undefined ? {} : { subtreeOwners: internals.subtreeOwners }),
    ...(internals?.validationOwner === undefined ? {} : { validationOwner: internals.validationOwner }),
  };
  const runtime = new FormRuntime(model, environment, runtimeOptions);
  bindFormRuntime(runtime.facade, runtime);
  return runtime.facade;
}

function fail(
  code: (typeof RUNTIME_DIAGNOSTIC_CODES)[keyof typeof RUNTIME_DIAGNOSTIC_CODES],
  message: string,
  metadata?: Readonly<Record<string, unknown>>,
): FormRuntimeError {
  return new FormRuntimeError(
    sortRuntimeDiagnostics([runtimeDiagnostic({ code, message, ...(metadata === undefined ? {} : { metadata }) })]),
  );
}
