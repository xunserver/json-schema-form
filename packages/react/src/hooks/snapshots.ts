import {
  arrayItemSelector,
  arrayOrderSelector,
  currentBindingSelector,
  fieldSelector,
  formSelector,
  presentableErrorSelector,
  viewSelector,
} from "@xunserver-jsf/core/runtime";
import type { ArrayItemId, InstancePathLike, ViewNodeId } from "@xunserver-jsf/core";
import { useRendererContext } from "../context/renderer-context.js";
import { memoizeSelector, useRuntimeSelector } from "./use-runtime-selector.js";

export function useFormSnapshot() {
  const { form } = useRendererContext();
  return useRuntimeSelector(form, memoizeSelector(form, "form", () => formSelector()));
}

export function useFieldSnapshot(path: InstancePathLike) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    memoizeSelector(form, `field:${String(path)}`, () => fieldSelector(path)),
  );
}

export function useViewSnapshot(id: ViewNodeId) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    memoizeSelector(form, `view:${id}`, () => viewSelector(id)),
  );
}

export function usePresentableErrors(path: InstancePathLike) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    memoizeSelector(form, `presentable:${String(path)}`, () => presentableErrorSelector(path)),
  );
}

export function useArrayOrder(path: InstancePathLike) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    memoizeSelector(form, `array-order:${String(path)}`, () => arrayOrderSelector(path)),
  );
}

export function useArrayItem(path: InstancePathLike, item: ArrayItemId) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    memoizeSelector(form, `array-item:${String(path)}:${item}`, () => arrayItemSelector(path, item)),
  );
}

export function useCurrentBinding(path: InstancePathLike) {
  const { form } = useRendererContext();
  return useRuntimeSelector(
    form,
    memoizeSelector(form, `binding:${String(path)}`, () => currentBindingSelector(path)),
  );
}

export function useArraySnapshot(path: InstancePathLike) {
  return {
    order: useArrayOrder(path),
    binding: useCurrentBinding(path),
  };
}
