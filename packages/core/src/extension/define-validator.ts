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

export function defineValidator<const T extends ValidatorDefinition>(
  definition: T & ExactKeys<T, ValidatorAuthoringShape>,
): T {
  return definition;
}
