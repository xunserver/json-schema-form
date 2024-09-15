import type { FormInstance } from "@form/core";
import {
  getRuntimeSnapshot,
  subscribeRuntime,
  type RuntimeSelector,
  type Unsubscribe,
} from "@form/core/runtime";
import { useCallback, useRef, useSyncExternalStore } from "react";

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

export function useRuntimeSelector<T>(form: FormInstance, selector: RuntimeSelector<T>): T {
  const serverSnapshot = useRef<T | undefined>(undefined);
  const identity = useRef({ form, selector });
  if (identity.current.form !== form || identity.current.selector !== selector) {
    identity.current = { form, selector };
    serverSnapshot.current = getRuntimeSnapshot(form, selector);
  } else if (serverSnapshot.current === undefined) {
    serverSnapshot.current = getRuntimeSnapshot(form, selector);
  }
  const subscribe = useCallback(
    (onStoreChange: () => void): Unsubscribe =>
      subscribeRuntime(form, selector, () => {
        onStoreChange();
      }),
    [form, selector],
  );
  const getSnapshot = useCallback(() => getRuntimeSnapshot(form, selector), [form, selector]);
  const getServerSnapshot = useCallback(() => {
    if (serverSnapshot.current === undefined) {
      serverSnapshot.current = getRuntimeSnapshot(form, selector);
    }
    return serverSnapshot.current;
  }, [form, selector]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
