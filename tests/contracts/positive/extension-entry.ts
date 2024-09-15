import {
  CORE_EXTENSION_PROTOCOL,
  createFormEnvironment,
  definePlugin,
  defineRuleFunction,
  defineValidator,
  defineWidget,
  EnvironmentBuildError,
} from "@form/core/extension";
import type {
  DialectConvertResult,
  FormEnvironment,
  FormPlugin,
  SchemaDialectDefinition,
  SchemaExtensionDefinition,
  SchemaExtensionSplitResult,
  ValueInitializerDefinition,
  WidgetDefinition,
  WidgetInteractionContract,
} from "@form/core/extension";

export const dialect: SchemaDialectDefinition = {
  name: "draft-07",
  dialects: ["http://json-schema.org/draft-07/schema#"],
  convert: (schema): DialectConvertResult => ({ schema }),
};

export const extension: SchemaExtensionDefinition = {
  name: "x-ui",
  keyword: "x-ui",
  split: (): SchemaExtensionSplitResult => ({}),
};

export const initializer: ValueInitializerDefinition = {
  name: "sample.defaults",
  initialize: ({ initialValues }) => initialValues ?? {},
};

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
    validators: {
      "sample.ok": defineValidator({
        name: "sample.ok",
        kind: "sync",
        validate: () => [],
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
