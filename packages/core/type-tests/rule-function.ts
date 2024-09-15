import { defineRuleFunction } from "../src/extension/define-rule-function.js";
import type { RuleFunctionDefinition, SerializerDefinition } from "../src/extension/contributions.js";
import type { JsonValue } from "../src/definition/json-value.js";

const fn = defineRuleFunction({
  name: "company.tax",
  evaluate: (args) => args[0] ?? 0,
});
void fn;

type FnKeys = keyof RuleFunctionDefinition;
type ForbiddenFn = Extract<FnKeys, "form" | "store" | "command" | "fetch" | "then">;
type AssertNoContext = ForbiddenFn extends never ? true : never;
const noContext: AssertNoContext = true;
void noContext;

const serializer: SerializerDefinition = {
  name: "company.payload",
  serialize: (value, context) => {
    void context.version;
    void context.includeInactive;
    return value;
  },
};
void serializer;

defineRuleFunction({
  name: "company.bad",
  // @ts-expect-error evaluate cannot be async
  evaluate: async (args) => args[0] ?? 0,
});

const rejectedPromise: RuleFunctionDefinition = {
  name: "company.promise",
  evaluate: (args): JsonValue => args[0] ?? null,
  // @ts-expect-error provider has no FormInstance context
  form: {},
};
void rejectedPromise;
