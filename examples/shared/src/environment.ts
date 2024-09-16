import { createFormEnvironment, definePlugin, defineRuleFunction, defineWidget } from "@xunserver-jsf/core/extension";
import { AJV_VALIDATOR_KEY, createAjvValidator } from "@xunserver-jsf/validator-ajv";
import type { JsonValue } from "@xunserver-jsf/core";

export const currencyWidget = defineWidget({
  name: "company.currency",
  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
  interaction: { setValue: true, touch: true, focus: true, blur: true },
});

function asNumber(value: JsonValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function createDemoEnvironment() {
  return createFormEnvironment({
    plugins: [
      definePlugin({
        id: "company",
        dependsOn: ["core"],
        contributes: {
          widgets: { "company.currency": currencyWidget },
          validators: { [AJV_VALIDATOR_KEY]: createAjvValidator() },
          ruleFunctions: {
            "playground.mul": defineRuleFunction({
              name: "playground.mul",
              evaluate: (args) => asNumber(args[0]) * asNumber(args[1]),
            }),
            "playground.sub": defineRuleFunction({
              name: "playground.sub",
              evaluate: (args) => asNumber(args[0]) - asNumber(args[1]),
            }),
            "playground.sumLines": defineRuleFunction({
              name: "playground.sumLines",
              evaluate: (args) => {
                const products = args[0];
                if (!Array.isArray(products)) {
                  return 0;
                }
                let sum = 0;
                for (const item of products) {
                  if (item === null || typeof item !== "object" || Array.isArray(item)) {
                    continue;
                  }
                  const record = item as Readonly<Record<string, JsonValue>>;
                  sum += asNumber(record.quantity) * asNumber(record.price);
                }
                return sum;
              },
            }),
          },
        },
      }),
    ],
  });
}
