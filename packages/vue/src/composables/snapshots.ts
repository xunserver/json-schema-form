import {
  arrayItemSelector,
  arrayOrderSelector,
  createSelector,
  currentBindingSelector,
  fieldSelector,
  formSelector,
  presentableErrorSelector,
  viewSelector,
} from "@xunserver-jsf/core/runtime";
import type { ArrayItemId, FieldSnapshot, InstancePathLike, ViewNodeId } from "@xunserver-jsf/core";
import { useRendererContext } from "../context/renderer-context.js";
import { memoizeSelector, useRuntimeSelector } from "./use-runtime-selector.js";

export function useFormSnapshot() {
  const { form } = useRendererContext();
  return useRuntimeSelector(form, memoizeSelector(form, "form", () => formSelector()));
}

export function useFieldSnapshot(pathSource: InstancePathLike | (() => InstancePathLike)) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    () => {
      const path = typeof pathSource === "function" ? pathSource() : pathSource;
      return memoizeSelector(form, `field:${String(path)}`, () => fieldSelector(path));
    },
  );
}

export function useFieldChromeSnapshot(pathSource: InstancePathLike | (() => InstancePathLike)) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    () => {
      const path = typeof pathSource === "function" ? pathSource() : pathSource;
      return memoizeSelector(form, `field-chrome:${String(path)}`, () => internFieldChrome(path));
    },
  );
}

export function useViewSnapshot(idSource: ViewNodeId | (() => ViewNodeId)) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    () => {
      const id = typeof idSource === "function" ? idSource() : idSource;
      return memoizeSelector(form, `view:${id}`, () => viewSelector(id));
    },
  );
}

export function usePresentableErrors(pathSource: InstancePathLike | (() => InstancePathLike)) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    () => {
      const path = typeof pathSource === "function" ? pathSource() : pathSource;
      return memoizeSelector(form, `presentable:${String(path)}`, () => presentableErrorSelector(path));
    },
  );
}

export function useArrayOrder(pathSource: InstancePathLike | (() => InstancePathLike)) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    () => {
      const path = typeof pathSource === "function" ? pathSource() : pathSource;
      return memoizeSelector(form, `array-order:${String(path)}`, () => arrayOrderSelector(path));
    },
  );
}

export function useArrayItem(
  pathSource: InstancePathLike | (() => InstancePathLike),
  itemSource: ArrayItemId | (() => ArrayItemId),
) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    () => {
      const path = typeof pathSource === "function" ? pathSource() : pathSource;
      const item = typeof itemSource === "function" ? itemSource() : itemSource;
      return memoizeSelector(form, `array-item:${String(path)}:${item}`, () => arrayItemSelector(path, item));
    },
  );
}

export function useCurrentBinding(pathSource: InstancePathLike | (() => InstancePathLike)) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    () => {
      const path = typeof pathSource === "function" ? pathSource() : pathSource;
      return memoizeSelector(form, `binding:${String(path)}`, () => currentBindingSelector(path));
    },
  );
}

export function useArraySnapshot(pathSource: InstancePathLike | (() => InstancePathLike)) {
  return {
    order: useArrayOrder(pathSource),
    binding: useCurrentBinding(pathSource),
  };
}

function internFieldChrome(path: InstancePathLike) {
  let last: FieldSnapshot | undefined;
  return createSelector([fieldSelector(path)], (snapshot) => {
    if (last !== undefined && sameFieldChrome(last, snapshot)) {
      return last;
    }
    last = snapshot;
    return snapshot;
  });
}

function sameFieldChrome(left: FieldSnapshot, right: FieldSnapshot): boolean {
  return (
    left.active === right.active &&
    left.visible === right.visible &&
    left.disabled === right.disabled &&
    left.readonly === right.readonly &&
    left.required === right.required &&
    left.validating === right.validating
  );
}
