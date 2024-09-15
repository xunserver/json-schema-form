import { compileForm, defineForm } from "@form/core";
import { createFormEnvironment, definePlugin, defineWidget } from "@form/core/extension";

export const defaultCompiled = compileForm(
  defineForm({
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
      },
    },
  }),
);

const plugin = definePlugin({
  id: "company",
  dependsOn: ["core"],
  contributes: {
    widgets: {
      sku: defineWidget({
        name: "sku",
        valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
        interaction: { setValue: true },
      }),
    },
  },
});

export const environment = createFormEnvironment({ plugins: [plugin] });

export const explicitCompiled = compileForm(
  defineForm({
    schema: {
      type: "object",
      properties: {
        code: { type: "string" },
      },
    },
    uiSchema: {
      fields: {
        code: { widget: "sku" },
      },
    },
  }),
  { environment },
);
