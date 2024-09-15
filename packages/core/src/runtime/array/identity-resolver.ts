import type { JsonValue } from "../form/contracts.js";

export type ArrayIdentityResolver = (item: JsonValue) => string | number | undefined;

export interface ArrayIdentityResolverBinding {
  readonly path: string;
  readonly resolve: ArrayIdentityResolver;
}

export function isSupportedResolverKey(value: unknown): value is string | number {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}
