/**
 * Advanced Runtime API：只读 selector、订阅、`RenderScope`。不要从根入口重导出这些符号。
 *
 * @module @xunserver-jsf/core/runtime
 */
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
/** 返回只读 `RenderScope`，把模板 ModelPath 解析为当前 InstancePath。 */
export { getRenderScope } from "./scope/render-scope.js";

/** 用 selector 读取当前 committed snapshot。 */
export function getRuntimeSnapshot<T>(form: FormInstance, selector: RuntimeSelector<T>): T {
  return resolveFormRuntime(form).getRuntimeSnapshot(selector);
}

/** 订阅 selector 结果。返回 unsubscribe。 */
export function subscribeRuntime<T>(
  form: FormInstance,
  selector: RuntimeSelector<T>,
  listener: (value: T) => void,
): Unsubscribe {
  return resolveFormRuntime(form).subscribeRuntime(selector, listener);
}

/** 观察 Runtime diagnostic 事件。 */
export function observeRuntimeDiagnostics(
  form: FormInstance,
  listener: (event: RuntimeDiagnosticEvent) => void,
): Unsubscribe {
  return resolveFormRuntime(form).observeDiagnostics(listener);
}
