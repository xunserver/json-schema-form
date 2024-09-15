import type { FormDefinition } from "./form-definition.js";

type ExactKeys<T, Allowed> = {
  [K in Exclude<keyof T, keyof Allowed>]: never;
};

export function defineForm<const T extends FormDefinition>(
  definition: T & ExactKeys<T, FormDefinition>,
): T {
  return definition;
}
