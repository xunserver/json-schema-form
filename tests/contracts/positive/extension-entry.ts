import {
  CORE_EXTENSION_PROTOCOL,
  createFormEnvironment,
  definePlugin,
  defineRuleFunction,
  defineWidget,
  EnvironmentBuildError,
} from "@form/core/extension";
import type {
  FormEnvironment,
  FormPlugin,
  WidgetDefinition,
  WidgetInteractionContract,
} from "@form/core/extension";

export const sku = defineWidget({
  name: "sku",
  valueContract: {
    jsonTypes: ["string"],
    canonical: "json-scalar",
  },
  interaction: { setValue: true, touch: true, focus: true, blur: true },
});

export const plugin: FormPlugin = definePlugin({
  id: "sample",
  contributes: {
    widgets: {
      sku,
    },
    ruleFunctions: {
      "sample.echo": defineRuleFunction({
        name: "sample.echo",
        evaluate: (args) => args[0] ?? null,
      }),
    },
  },
});

export const environment: FormEnvironment = createFormEnvironment({
  plugins: [plugin],
});

export const protocol = CORE_EXTENSION_PROTOCOL;

export type SampleWidget = WidgetDefinition;
export type SampleInteraction = WidgetInteractionContract;

export function isEnvironmentBuildError(error: unknown): error is EnvironmentBuildError {
  return error instanceof EnvironmentBuildError;
}
