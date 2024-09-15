import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { CreateFormOptions, FormInstance } from "./contracts.js";
import { instantiateForm, type CreateFormInternals } from "./create-form.js";
import { resolveFormRuntime } from "./handle.js";
import type { FormRuntime } from "./form-runtime.js";

export function createFormWithTestHooks(
  model: CompiledFormModel,
  options?: CreateFormOptions,
  internals?: CreateFormInternals,
): FormInstance {
  return instantiateForm(model, options, internals);
}

export function peekFormRuntime(form: FormInstance): FormRuntime {
  return resolveFormRuntime(form);
}

export type { CreateFormInternals } from "./create-form.js";
export type { PhaseSet, TransactionPhaseContext } from "./phases.js";
