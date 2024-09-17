import { compileForm, createForm, createFormEngine, defineForm, type FormDefinition, type FormInstance, type JsonValue, type ViewNode, type ViewNodeId } from "@xunserver-jsf/core";
import { createFormEnvironment, definePlugin, defineRuleFunction, defineValidator, defineWidget } from "@xunserver-jsf/core/extension";
import { AJV_VALIDATOR_KEY, createAjvValidator } from "@xunserver-jsf/validator-ajv";

export const currencyWidget = defineWidget({
  name: "company.currency",
  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
  interaction: { setValue: true, touch: true, focus: true, blur: true },
});

export function createV1BusinessPlugin() {
  return definePlugin({
    id: "company",
    dependsOn: ["core"],
    contributes: {
      widgets: { "company.currency": currencyWidget },
      validators: {
        [AJV_VALIDATOR_KEY]: createAjvValidator(),
        "company.format": defineValidator({
          name: "company.format",
          kind: "sync",
          validate: (context) =>
            typeof context.target === "string" && context.target.length > 0 ? [] : [{ code: "company.empty" }],
        }),
        "company.unique": defineValidator({
          name: "company.unique",
          kind: "async",
          validate: async (context) => (context.target === "taken" ? [{ code: "company.taken" }] : []),
        }),
      },
      ruleFunctions: {
        "company.double": defineRuleFunction({
          name: "company.double",
          evaluate: (args) => (typeof args[0] === "number" ? args[0] * 2 : 0),
        }),
      },
    },
  });
}

export function createV1Environment() {
  return createFormEnvironment({ plugins: [createV1BusinessPlugin()] });
}

export const v1Definition: FormDefinition = defineForm({
  schema: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
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
      amount: { type: "number" },
      total: { type: "number" },
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            quantity: { type: "number" },
            lineTotal: { type: "number" },
          },
        },
      },
    },
    required: ["name"],
    if: { properties: { kind: { const: "show" } }, required: ["kind"] },
    then: { properties: { nickname: { type: "string" } }, required: ["nickname"] },
  },
  uiSchema: {
    fields: {
      name: { widget: "text", display: { label: "Name", help: "Full name" } },
      bio: { widget: "textarea", display: { label: "Bio" } },
      age: { widget: "number", display: { label: "Age" } },
      role: { widget: "select", display: { label: "Role" }, props: { options: ["admin", "user"] } },
      tags: { widget: "multi-select", display: { label: "Tags" }, props: { options: ["a", "b"] } },
      "tags[]": { field: false },
      active: { widget: "checkbox", display: { label: "Active" } },
      alerts: { widget: "switch", display: { label: "Alerts" } },
      joined: { widget: "date", display: { label: "Joined" } },
      meeting: { widget: "datetime", display: { label: "Meeting" } },
      currency: { widget: "company.currency", display: { label: "Currency" } },
      kind: { widget: "text", display: { label: "Kind" } },
      nickname: { widget: "text", display: { label: "Nickname" } },
      amount: { widget: "number", display: { label: "Amount" } },
      total: { widget: "number", display: { label: "Total" } },
    },
    layout: {
      type: "object",
      children: [
        { type: "group", title: "基本资料", description: "姓名与个人简介", children: [{ type: "field", path: "name" }, { type: "field", path: "bio" }] },
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
    {
      kind: "computed",
      target: "total",
      action: { value: { call: "company.double", args: [{ field: "amount" }] } },
    },
    {
      kind: "computed",
      target: "products[].lineTotal",
      action: { value: { field: "products[].quantity" } },
    },
  ],
  config: {
    schemaValidator: AJV_VALIDATOR_KEY,
    validators: [
      { validator: "company.format", target: "name", dependencies: [], trigger: "blur" },
      { validator: "company.unique", target: "currency", dependencies: [] },
    ],
  },
});

export const v1InitialValues = {
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
  amount: 21,
  total: 0,
  products: [
    { title: "First", quantity: 2, lineTotal: 0 },
    { title: "Second", quantity: 1, lineTotal: 0 },
  ],
} as const;

export const v1DefaultDefinition: FormDefinition = defineForm({
  schema: v1Definition.schema,
  uiSchema: {
    ...v1Definition.uiSchema,
    fields: {
      ...v1Definition.uiSchema?.fields,
      currency: { widget: "text", display: { label: "Currency" } },
    },
  },
  rules: [
    {
      kind: "state",
      target: "nickname",
      action: { visible: { eq: [{ field: "kind" }, "show"] } },
    },
    {
      kind: "computed",
      target: "total",
      action: { value: { field: "amount" } },
    },
  ],
});

export function compileV1(mode: "default" | "explicit" | "engine" = "explicit") {
  if (mode === "default") {
    const { model, diagnostics } = compileForm(v1DefaultDefinition);
    return { model, diagnostics, form: createForm(model, { initialValues: v1InitialValues }) };
  }
  if (mode === "engine") {
    const engine = createFormEngine({ plugins: [createV1BusinessPlugin()] });
    const { model, diagnostics } = engine.compile(v1Definition);
    return { model, diagnostics, form: engine.create(model, { initialValues: v1InitialValues }), engine };
  }
  const environment = createV1Environment();
  const { model, diagnostics } = compileForm(v1Definition, { environment });
  return {
    model,
    diagnostics,
    environment,
    form: createForm(model, { environment, initialValues: v1InitialValues }),
  };
}

export function collectFieldViews(node: ViewNode, fieldPath?: string): Array<{ id: ViewNodeId; fieldPath: string }> {
  const found: Array<{ id: ViewNodeId; fieldPath: string }> = [];
  if (node.kind === "field" && (fieldPath === undefined || node.fieldPath === fieldPath)) {
    found.push({ id: node.id, fieldPath: node.fieldPath });
  }
  if ("children" in node) {
    for (const child of node.children) {
      found.push(...collectFieldViews(child, fieldPath));
    }
  }
  if ("itemLayout" in node) {
    for (const child of node.itemLayout) {
      found.push(...collectFieldViews(child, fieldPath));
    }
  }
  return found;
}

export function fieldViewId(form: FormInstance, fieldPath: string): ViewNodeId {
  const view = collectFieldViews(form.model.ui.viewTree, fieldPath)[0];
  if (view === undefined) {
    throw new Error(`No field view for ${fieldPath}`);
  }
  return view.id;
}

export type SemanticStep =
  | { readonly type: "setValue"; readonly path: string; readonly value: JsonValue }
  | { readonly type: "touch"; readonly path: string }
  | { readonly type: "focus"; readonly path: string }
  | { readonly type: "blur"; readonly path: string }
  | { readonly type: "setCollapsed"; readonly viewPath: string; readonly collapsed: boolean }
  | { readonly type: "move"; readonly from: number; readonly to: number }
  | { readonly type: "validate" }
  | { readonly type: "submit" };

export const v1SemanticSteps: readonly SemanticStep[] = [
  { type: "setValue", path: "name", value: "Grace" },
  { type: "touch", path: "name" },
  { type: "focus", path: "name" },
  { type: "blur", path: "name" },
  { type: "setValue", path: "amount", value: 30 },
  { type: "setValue", path: "kind", value: "hide" },
  { type: "move", from: 0, to: 1 },
  { type: "validate" },
  { type: "submit" },
];

export async function applySemanticSteps(form: FormInstance, steps: readonly SemanticStep[] = v1SemanticSteps) {
  let submitted: JsonValue | undefined;
  for (const step of steps) {
    switch (step.type) {
      case "setValue":
        form.setValue(step.path, step.value);
        break;
      case "touch":
        form.touch(step.path);
        break;
      case "focus":
        form.focus(fieldViewId(form, step.path));
        break;
      case "blur":
        form.blur(fieldViewId(form, step.path));
        break;
      case "setCollapsed":
        form.setCollapsed(form.model.ui.viewTree.id, step.collapsed);
        break;
      case "move":
        form.array("products").move(step.from, step.to);
        break;
      case "validate":
        await form.validate();
        break;
      case "submit":
        await form.submit(async (payload) => {
          submitted = payload;
        });
        break;
    }
  }
  return submitted;
}
