import type { RuleFunctionDefinition } from "./contributions.js";

type ExactKeys<T, Allowed> = {
  [K in Exclude<keyof T, keyof Allowed>]: never;
};

export function defineRuleFunction<const T extends RuleFunctionDefinition>(
  definition: T & ExactKeys<T, RuleFunctionDefinition>,
): T {
  return definition;
}
