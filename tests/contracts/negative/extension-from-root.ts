import { createFormEnvironment, definePlugin, defineValidator, defineWidget } from "@form/core";

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
