import {
  arrayItemSelector,
  arrayOrderSelector,
  currentBindingSelector,
  fieldSelector,
  formSelector,
  presentableErrorSelector,
  viewSelector,
} from "@form/core/runtime";
import type { ArrayItemId, InstancePathLike, ViewNodeId } from "@form/core";
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
