export type {
  RuntimeDiagnosticEvent,
  RuntimeSelector,
  Unsubscribe,
} from "./selectors.js";
export {
  createSelector,
  fieldSelector,
  formSelector,
  valueSelector,
  viewSelector,
} from "./selectors.js";

export type { FieldSnapshot, FormSnapshot, JsonValue, ViewSnapshot } from "./contracts.js";

import type { FormInstance } from "./contracts.js";
import { resolveFormRuntime } from "./handle.js";
import type { RuntimeDiagnosticEvent, RuntimeSelector, Unsubscribe } from "./selectors.js";

export function getRuntimeSnapshot<T>(form: FormInstance, selector: RuntimeSelector<T>): T {
  return resolveFormRuntime(form).getRuntimeSnapshot(selector);
}

export function subscribeRuntime<T>(
  form: FormInstance,
  selector: RuntimeSelector<T>,
  listener: (value: T) => void,
): Unsubscribe {
  return resolveFormRuntime(form).subscribeRuntime(selector, listener);
}

export function observeRuntimeDiagnostics(
  form: FormInstance,
  listener: (event: RuntimeDiagnosticEvent) => void,
): Unsubscribe {
  return resolveFormRuntime(form).observeDiagnostics(listener);
}
