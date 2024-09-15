import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { EnvironmentIdentity } from "./environment-identity.js";

const MODEL_ENVIRONMENTS = new WeakMap<object, EnvironmentIdentity>();

export function rememberModelEnvironment(
  model: CompiledFormModel,
  identity: EnvironmentIdentity,
): void {
  MODEL_ENVIRONMENTS.set(model, identity);
}

export function peekModelEnvironment(model: CompiledFormModel): EnvironmentIdentity | undefined {
  return MODEL_ENVIRONMENTS.get(model);
}
