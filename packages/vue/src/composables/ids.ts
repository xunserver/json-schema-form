import { useId } from "vue";
import { useRendererContext } from "../context/renderer-context.js";
import type { ArrayItemId, ViewNodeId } from "@form/core";
import type { FieldDomIds } from "../adapter/types.js";

export function useFormIdPrefix(explicit?: string): string {
  const generated = useId();
  return explicit !== undefined && explicit !== "" ? explicit : generated.replace(/[^A-Za-z0-9_-]/g, "");
}

export function encodeViewDomId(
  prefix: string,
  viewId: ViewNodeId,
  itemChain: readonly ArrayItemId[] = [],
): string {
  const chain = itemChain.length === 0 ? "" : `-${itemChain.join("-")}`;
  return `${prefix}-${viewId}${chain}`;
}

export function createFieldDomIds(
  prefix: string,
  viewId: ViewNodeId,
  itemChain: readonly ArrayItemId[],
  errorCount: number,
): FieldDomIds {
  const base = encodeViewDomId(prefix, viewId, itemChain);
  const errors = Array.from({ length: errorCount }, (_, index) => `${base}-error-${index}`);
  return Object.freeze({
    prefix: base,
    control: `${base}-control`,
    label: `${base}-label`,
    help: `${base}-help`,
    errors: Object.freeze(errors),
  });
}

export function useFieldDomIds(viewId: ViewNodeId, errorCount: number): FieldDomIds {
  const { idPrefix, scope } = useRendererContext();
  return createFieldDomIds(idPrefix, viewId, scope.binding.itemChain, errorCount);
}
