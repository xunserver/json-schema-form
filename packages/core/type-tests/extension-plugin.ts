import { definePlugin } from "../src/extension/plugin.js";
import type { FormPlugin, PluginContributions } from "../src/extension/plugin.js";
import type { RegistryKind } from "../src/extension/registry.js";
import type { WidgetDefinition } from "../src/extension/widget.js";
import type { InstrumentationDefinition, ValidatorDefinition } from "../src/extension/contributions.js";

const plugin = definePlugin({
  id: "company.feature",
  protocol: { min: { major: 1, minor: 0 } },
  dependsOn: ["core"],
  contributes: {
    widgets: {
      sku: {
        name: "sku",
        valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
        interaction: { setValue: true },
      },
    },
    ruleFunctions: {
      trim: { name: "trim", evaluate: (args) => args[0] ?? "" },
    },
    validators: {
      uniqueSku: { name: "uniqueSku", kind: "sync", validate: () => [] },
    },
  },
});

void plugin;

type InferredId = typeof plugin.id;
const idLiteral: InferredId = "company.feature";
void idLiteral;

declare const authored: FormPlugin;

// @ts-expect-error Plugin id is readonly
authored.id = "other";

// @ts-expect-error Plugin contributions are readonly
authored.contributes = {};

definePlugin({
  id: "bad.install",
  // @ts-expect-error Plugin contract has no imperative install hook
  install: () => undefined,
});

const rejectedWidgetComponent: WidgetDefinition = {
  name: "text",
  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
  interaction: { setValue: true },
  // @ts-expect-error Core Widget contract has no framework component
  component: {},
};
void rejectedWidgetComponent;

const rejectedWidgetEvent: WidgetDefinition = {
  name: "text",
  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
  interaction: { setValue: true },
  // @ts-expect-error Core Widget contract has no DOM event handler
  onClick: () => undefined,
};
void rejectedWidgetEvent;

const validator: ValidatorDefinition = {
  name: "unique",
  kind: "sync",
  validate: () => [],
  // @ts-expect-error Core validator contract has no AJV instance
  ajv: {},
};
void validator;

type WidgetKeys = keyof WidgetDefinition;
type ForbiddenWidgetKeys = Extract<
  WidgetKeys,
  "component" | "render" | "onClick" | "onInput" | "nativeEvent" | "vue" | "react" | "Ajv"
>;
type AssertNoWidgetHostKeys = ForbiddenWidgetKeys extends never ? true : never;
const noWidgetHostKeys: AssertNoWidgetHostKeys = true;
void noWidgetHostKeys;

type AssertHasInteraction = "interaction" extends WidgetKeys ? true : never;
const hasInteraction: AssertHasInteraction = true;
void hasInteraction;

type ContributionKeys = keyof PluginContributions;
type AssertContributionKeys = ContributionKeys extends RegistryKind
  ? RegistryKind extends ContributionKeys
    ? true
    : never
  : never;
const contributionKeys: AssertContributionKeys = true;
void contributionKeys;

type InstrumentationKeys = keyof InstrumentationDefinition;
type ForbiddenInstrumentation = Extract<
  InstrumentationKeys,
  "beforeSetValue" | "afterCompile" | "transactionManager" | "compilerContext"
>;
type AssertReadonlyInstrumentation = ForbiddenInstrumentation extends never ? true : never;
const readonlyInstrumentation: AssertReadonlyInstrumentation = true;
void readonlyInstrumentation;
