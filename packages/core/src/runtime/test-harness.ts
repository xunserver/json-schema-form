import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { CreateFormOptions, FormInstance } from "./contracts.js";
import { instantiateForm, type CreateFormInternals } from "./create-form.js";

export function createFormWithTestHooks(
  model: CompiledFormModel,
  options?: CreateFormOptions,
  internals?: CreateFormInternals,
): FormInstance {
  return instantiateForm(model, options, internals);
}

export type { CreateFormInternals } from "./create-form.js";
export type { PhaseSet, TransactionPhaseContext } from "./phases.js";
