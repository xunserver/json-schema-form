import { compileForm, createForm, defineForm } from "@form/core";
import { createFormEnvironment, definePlugin, defineWidget } from "@form/core/extension";
import { createAjvValidator } from "@form/validator-ajv";

export const currencyWidget = defineWidget({
  name: "company.currency",
  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
  interaction: { setValue: true, touch: true, focus: true, blur: true },
});

export function createDemoEnvironment() {
  return createFormEnvironment({
    plugins: [
      definePlugin({
        id: "company",
        dependsOn: ["core"],
        contributes: {
          widgets: { "company.currency": currencyWidget },
          validators: { "ajv-2020": createAjvValidator() },
        },
      }),
    ],
  });
}

export const demoDefinition = defineForm({
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      bio: { type: "string" },
      age: { type: "number" },
      role: { type: "string", enum: ["admin", "user"] },
      tags: { type: "array", items: { type: "string", enum: ["a", "b"] } },
      active: { type: "boolean" },
      alerts: { type: "boolean" },
      joined: { type: "string", format: "date" },
      meeting: { type: "string", format: "date-time" },
      currency: { type: "string" },
      kind: { type: "string" },
      nickname: { type: "string" },
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
          },
        },
      },
    },
    required: ["name"],
  },
  uiSchema: {
    fields: {
      name: { widget: "text", display: { label: "Name", help: "Full name" } },
      bio: { widget: "textarea", display: { label: "Bio" } },
      age: { widget: "number", display: { label: "Age" } },
      role: { widget: "select", display: { label: "Role" }, props: { options: ["admin", "user"] } },
      tags: {
        widget: "multi-select",
        display: { label: "Tags" },
        props: { options: ["a", "b"] },
      },
      "tags[]": { field: false },
      active: { widget: "checkbox", display: { label: "Active" } },
      alerts: { widget: "switch", display: { label: "Alerts" } },
      joined: { widget: "date", display: { label: "Joined" } },
      meeting: { widget: "datetime", display: { label: "Meeting" } },
      currency: { widget: "company.currency", display: { label: "Currency" } },
      kind: { widget: "text", display: { label: "Kind" } },
      nickname: { widget: "text", display: { label: "Nickname" } },
    },
    layout: {
      type: "object",
      children: [
        { type: "group", children: [{ type: "field", path: "name" }, { type: "field", path: "bio" }] },
        {
          type: "layout",
          columns: 2,
          children: [
            { type: "field", path: "age" },
            { type: "field", path: "role" },
          ],
        },
        { type: "array", path: "products", children: [{ type: "remaining-fields" }] },
        { type: "remaining-fields" },
      ],
    },
  },
  rules: [
    {
      kind: "state",
      target: "nickname",
      action: { visible: { eq: [{ field: "kind" }, "show"] } },
    },
  ],
});

export function createDemoForm() {
  const environment = createDemoEnvironment();
  const { model } = compileForm(demoDefinition, { environment });
  return createForm(model, {
    environment,
    initialValues: {
      name: "Ada",
      bio: "Pioneer",
      age: 36,
      role: "admin",
      tags: ["a"],
      active: true,
      alerts: false,
      joined: "2026-09-15",
      meeting: "2026-09-15T12:00:00Z",
      currency: "USD",
      kind: "show",
      nickname: "A",
      products: [{ title: "First" }, { title: "Second" }],
    },
  });
}
