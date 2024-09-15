import { createFormEnvironment } from "../extension/create-form-environment.js";
import type { FormEnvironment } from "../extension/environment.js";

let sharedDefault: FormEnvironment | undefined;

export function getSharedDefaultEnvironment(): FormEnvironment {
  if (sharedDefault === undefined) {
    sharedDefault = createFormEnvironment();
  }
  return sharedDefault;
}
