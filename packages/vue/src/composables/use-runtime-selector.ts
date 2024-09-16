import type { FormInstance } from "@xunserver-jsf/core";
import {
  getRuntimeSnapshot,
  subscribeRuntime,
  type RuntimeSelector,
  type Unsubscribe,
} from "@xunserver-jsf/core/runtime";
import { onMounted, onScopeDispose, shallowRef, watch, type ShallowRef } from "vue";

const SELECTOR_CACHE = new WeakMap<FormInstance, Map<string, RuntimeSelector<unknown>>>();

export function memoizeSelector<T>(
  form: FormInstance,
  key: string,
  factory: () => RuntimeSelector<T>,
): RuntimeSelector<T> {
  let byForm = SELECTOR_CACHE.get(form);
  if (byForm === undefined) {
    byForm = new Map();
    SELECTOR_CACHE.set(form, byForm);
  }
  const existing = byForm.get(key);
  if (existing !== undefined) {
    return existing as RuntimeSelector<T>;
  }
  const created = factory();
  byForm.set(key, created);
  return created;
}

export function useRuntimeSelector<T>(
  formSource: FormInstance | (() => FormInstance),
  selectorSource: RuntimeSelector<T> | (() => RuntimeSelector<T>),
): ShallowRef<T> {
  const getForm = typeof formSource === "function" ? formSource : () => formSource;
  const getSelector = typeof selectorSource === "function" ? selectorSource : () => selectorSource;
  const snapshot = shallowRef(getRuntimeSnapshot(getForm(), getSelector())) as ShallowRef<T>;
  let unsubscribe: Unsubscribe | undefined;
  let mounted = false;

  function unbind(): void {
    unsubscribe?.();
    unsubscribe = undefined;
  }

  function read(): void {
    const next = getRuntimeSnapshot(getForm(), getSelector());
    if (!Object.is(snapshot.value, next)) {
      snapshot.value = next;
    }
  }

  function bind(): void {
    unbind();
    read();
    if (!mounted) {
      return;
    }
    unsubscribe = subscribeRuntime(getForm(), getSelector(), (value) => {
      if (!Object.is(snapshot.value, value)) {
        snapshot.value = value;
      }
    });
  }

  onMounted(() => {
    mounted = true;
    bind();
  });

  onScopeDispose(() => {
    mounted = false;
    unbind();
  });

  watch([getForm, getSelector], () => bind(), { flush: "sync" });

  return snapshot;
}
