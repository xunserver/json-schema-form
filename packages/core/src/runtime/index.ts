export type {
  RuntimeDiagnosticEvent,
  RuntimeSelector,
  Unsubscribe,
} from "./subscription/selectors.js";
export {
  arrayItemSelector,
  arrayOrderSelector,
  createSelector,
  currentBindingSelector,
  effectiveStateSelector,
  fieldSelector,
  formSelector,
  itemPathSelector,
  itemValueSelector,
  presentableErrorSelector,
  valueSelector,
  viewSelector,
} from "./subscription/selectors.js";

export type { ArrayIdentityResolver, ArrayIdentityResolverBinding } from "./array/identity-resolver.js";
export type {
  ArrayItemSnapshot,
  CurrentBindingSnapshot,
  EffectiveState,
  FieldSnapshot,
  FormSnapshot,
  InstanceBinding,
  JsonValue,
  RenderScope,
} from "./form/contracts.js";

import type { FormInstance } from "./form/contracts.js";
import { resolveFormRuntime } from "./form/handle.js";
import type { RuntimeDiagnosticEvent, RuntimeSelector, Unsubscribe } from "./subscription/selectors.js";
export { getRenderScope } from "./scope/render-scope.js";

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
