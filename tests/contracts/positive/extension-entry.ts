import {
  CORE_EXTENSION_PROTOCOL,
  createFormEnvironment,
  definePlugin,
  EnvironmentBuildError,
} from "@form/core/extension";
import type {
  FormEnvironment,
  FormPlugin,
  WidgetDefinition,
} from "@form/core/extension";

export const plugin: FormPlugin = definePlugin({
  id: "sample",
  contributes: {
    widgets: {
      sku: {
        name: "sku",
        valueContract: {
          jsonTypes: ["string"],
          canonical: "json-scalar",
        },
      },
    },
  },
});

export const environment: FormEnvironment = createFormEnvironment({
  plugins: [plugin],
});

export const protocol = CORE_EXTENSION_PROTOCOL;

export type SampleWidget = WidgetDefinition;

export function isEnvironmentBuildError(error: unknown): error is EnvironmentBuildError {
  return error instanceof EnvironmentBuildError;
}
