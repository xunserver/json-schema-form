import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { CreateFormOptions, FormInstance } from "./form/contracts.js";
import { instantiateForm, type CreateFormInternals } from "./form/create-form.js";
import { resolveFormRuntime } from "./form/handle.js";
import type { FormRuntime } from "./form/form-runtime.js";

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

export type { CreateFormInternals } from "./form/create-form.js";
export type { PhaseSet, TransactionPhaseContext } from "./transaction/phases.js";
