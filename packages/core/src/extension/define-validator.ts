import type { ValidatorDefinition } from "./contributions.js";

type ValidatorAuthoringShape = {
  readonly name: unknown;
  readonly kind: unknown;
  readonly validate?: unknown;
  readonly capabilities?: unknown;
  readonly validateAll?: unknown;
  readonly validateAt?: unknown;
  readonly validateAffected?: unknown;
};

type ExactKeys<T, Allowed> = {
  [K in Exclude<keyof T, keyof Allowed>]: never;
};

/** 声明 validator（含 schema-adapter）。必须注册进冻结 Environment。 */
export function defineValidator<const T extends ValidatorDefinition>(
  definition: T & ExactKeys<T, ValidatorAuthoringShape>,
): T {
  return definition;
}
