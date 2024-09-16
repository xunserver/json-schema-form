import type { RuleFunctionDefinition } from "./contributions.js";

type ExactKeys<T, Allowed> = {
  [K in Exclude<keyof T, keyof Allowed>]: never;
};

/** 声明 named rule function。Compiled Model 只保存 key。 */
export function defineRuleFunction<const T extends RuleFunctionDefinition>(
  definition: T & ExactKeys<T, RuleFunctionDefinition>,
): T {
  return definition;
}
