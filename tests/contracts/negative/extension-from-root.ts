import { createFormEnvironment, definePlugin, defineValidator, defineWidget } from "@xunserver-jsf/core";
import type {
  SchemaDialectDefinition,
  SchemaExtensionDefinition,
  ValueInitializerDefinition,
} from "@xunserver-jsf/core";

export const leakedPlugin = definePlugin({ id: "leaked" });
export const leakedWidget = defineWidget({
  name: "leaked",
  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
  interaction: { setValue: true },
});
export const environment = createFormEnvironment();
export const leakedValidator = defineValidator({
  name: "leaked",
  kind: "sync",
  validate: () => [],
});
export type LeakedDialect = SchemaDialectDefinition;
export type LeakedExtension = SchemaExtensionDefinition;
export type LeakedInitializer = ValueInitializerDefinition;
