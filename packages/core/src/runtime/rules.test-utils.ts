import { compileForm } from "../compiler/compile-form.js";
import { defineForm } from "../definition/define-form.js";
import type { FormDefinition } from "../definition/form-definition.js";
import { createFormEnvironment } from "../extension/create-form-environment.js";
import { definePlugin } from "../extension/plugin.js";
import { defineRuleFunction } from "../extension/define-rule-function.js";
import type { FormEnvironment } from "../extension/environment.js";
import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { JsonValue } from "./form/contracts.js";

export const RULE_SCHEMA = {
  type: "object" as const,
  properties: {
    country: { type: "string" as const },
    region: { type: "string" as const },
    hidden: { type: "string" as const },
    amount: { type: "number" as const },
    taxRate: { type: "number" as const },
    subtotal: { type: "number" as const },
    total: { type: "number" as const },
    flag: { type: "boolean" as const },
    kind: { type: "string" as const },
    company: { type: "string" as const },
    person: { type: "string" as const },
    creditCard: { type: "string" as const },
    billing: { type: "string" as const },
    products: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          quantity: { type: "number" as const },
          price: { type: "number" as const },
          total: { type: "number" as const },
        },
      },
    },
  },
};

export function taxEnvironment(): FormEnvironment {
  return createFormEnvironment({
    plugins: [
      definePlugin({
        id: "company",
        dependsOn: ["core"],
        contributes: {
          ruleFunctions: {
            "company.tax": defineRuleFunction({
              name: "company.tax",
              evaluate: (args) => {
                const amount = typeof args[0] === "number" ? args[0] : 0;
                const rate = typeof args[1] === "number" ? args[1] : 0;
                return amount * rate;
              },
            }),
          },
          serializers: {
            "company.payload": {
              name: "company.payload",
              serialize: (value, context) => ({ wrapped: value, includeInactive: context.includeInactive, version: context.version }),
            },
          },
        },
      }),
    ],
  });
}

export function compileRules(
  extra: Partial<FormDefinition> = {},
  environment: FormEnvironment = taxEnvironment(),
): { model: CompiledFormModel; environment: FormEnvironment } {
  const model = compileForm(
    defineForm({
      schema: RULE_SCHEMA,
      ...extra,
    } as FormDefinition),
    { environment },
  ).model;
  return { model, environment };
}

export function sampleProducts(): JsonValue {
  return {
    country: "CN",
    region: "east",
    hidden: "secret",
    amount: 10,
    taxRate: 0.1,
    subtotal: 0,
    total: 0,
    flag: true,
    kind: "company",
    company: "Acme",
    products: [
      { quantity: 2, price: 5, total: 0 },
      { quantity: 1, price: 8, total: 0 },
    ],
  };
}
