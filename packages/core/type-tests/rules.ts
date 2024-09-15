import { defineForm } from "../src/definition/define-form.js";
import type {
  ComputedRuleDefinition,
  EffectRuleDefinition,
  RuleExpression,
  StateRuleDefinition,
  ValidationRuleDefinition,
} from "../src/definition/rule-definition.js";
import type { FormConfig } from "../src/definition/form-config.js";

const expression: RuleExpression = {
  eq: [{ field: "country" }, "CN"],
};
void expression;

const state: StateRuleDefinition = {
  kind: "state",
  target: "country",
  action: { visible: { eq: [{ field: "country" }, "CN"] } },
};
void state;

const computed: ComputedRuleDefinition = {
  kind: "computed",
  target: "total",
  action: { value: { call: "company.tax", args: [{ field: "amount" }] } },
};
void computed;

const validation: ValidationRuleDefinition = {
  kind: "validation",
  target: "country",
  action: {
    assertion: true,
    failure: { code: "required", message: "needed", params: { min: 1 } },
  },
};
void validation;

const effect: EffectRuleDefinition = {
  kind: "effect",
  action: { actions: [{ type: "setValue", target: "region", value: "CN" }] },
};
void effect;

const config: FormConfig = {
  serializeInactive: false,
  serializer: "company.payload",
};
void config;

const authored = defineForm({
  schema: { type: "object", properties: { country: { type: "string" }, total: { type: "number" } } },
  rules: [state, computed, validation, effect],
  config,
});
void authored.config?.serializer;

const badState: StateRuleDefinition = {
  kind: "state",
  target: "country",
  // @ts-expect-error State action cannot declare a computed value
  action: { value: 1 },
};
void badState;

const badComputed: ComputedRuleDefinition = {
  kind: "computed",
  target: "total",
  // @ts-expect-error Computed action cannot declare a validation issue
  action: { assertion: true },
};
void badComputed;

const badValidation: ValidationRuleDefinition = {
  kind: "validation",
  target: "country",
  action: {
    assertion: true,
    failure: {
      code: "x",
      message: "y",
      // @ts-expect-error Validation metadata cannot include instancePath
      instancePath: "/country",
    },
  },
};
void badValidation;

const badEffect: EffectRuleDefinition = {
  kind: "effect",
  action: {
    actions: [
      // @ts-expect-error Effect rules only accept setValue
      { type: "submit", target: "region", value: "x" },
    ],
  },
};
void badEffect;

defineForm({
  schema: true,
  rules: [
    {
      kind: "state",
      target: "name",
      // @ts-expect-error Rule expressions cannot be functions
      when: () => true,
      action: { visible: true },
    },
  ],
});
