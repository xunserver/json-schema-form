import { useId } from "react";
import { useRendererContext } from "../context/renderer-context.js";
import type { ViewNodeId } from "@form/core";
import type { FieldDomIds } from "../adapter/types.js";

export function useFormIdentifierPrefix(explicit?: string): string {
  const generated = useId();
  return explicit !== undefined && explicit !== ""
    ? explicit
    : generated.replace(/[^A-Za-z0-9_-]/g, "");
}

export function encodeViewDomId(prefix: string, viewId: ViewNodeId): string {
  return `${prefix}-${viewId}`;
}

export function createFieldDomIds(prefix: string, viewId: ViewNodeId, errorCount: number): FieldDomIds {
  const base = encodeViewDomId(prefix, viewId);
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
  const { identifierPrefix } = useRendererContext();
  const generated = useId();
  const token = generated.replace(/[^A-Za-z0-9_-]/g, "");
  const prefix =
    identifierPrefix !== undefined && identifierPrefix !== ""
      ? `${identifierPrefix}-${token}`
      : token;
  return createFieldDomIds(prefix, viewId, errorCount);
}
