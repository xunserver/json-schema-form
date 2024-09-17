export interface NamedFixture {
  readonly id: string;
  readonly schemaText: string;
  readonly uiSchemaText: string;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export const SUPPORTED_FIXTURES: readonly NamedFixture[] = Object.freeze([
  Object.freeze({
    id: "supported.empty-root",
    schemaText: json({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {},
    }),
    uiSchemaText: json({ fields: {} }),
  }),
  Object.freeze({
    id: "supported.root-scalar-fields",
    schemaText: json({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        name: { type: "string", title: "姓名" },
        age: { type: "number", title: "年龄" },
        active: { type: "boolean", title: "启用" },
        role: { type: "string", title: "角色", enum: ["admin", "user"], default: "user" },
      },
      required: ["name"],
    }),
    uiSchemaText: json({
      fields: {
        name: { widget: "text", display: { label: "姓名" } },
        age: { widget: "number", display: { label: "年龄" } },
        active: { widget: "checkbox", display: { label: "启用" } },
        role: { widget: "select", display: { label: "角色" } },
      },
      layout: {
        type: "layout",
        columns: 1,
        children: [
          { type: "field", path: "name" },
          { type: "field", path: "age" },
          { type: "field", path: "active" },
          { type: "field", path: "role" },
        ],
      },
    }),
  }),
  Object.freeze({
    id: "supported.no-explicit-layout",
    schemaText: json({
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        age: { type: "number" },
      },
      required: ["name"],
    }),
    uiSchemaText: json({
      fields: {
        name: { display: { label: "姓名" } },
        email: { display: { label: "邮箱" } },
        age: { display: { label: "年龄" } },
      },
    }),
  }),
  Object.freeze({
    id: "supported.group-and-layouts",
    schemaText: json({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        first: { type: "string" },
        second: { type: "string" },
        third: { type: "number" },
      },
    }),
    uiSchemaText: json({
      fields: {
        first: { widget: "text" },
        second: { widget: "text" },
        third: { widget: "number" },
      },
      layout: {
        type: "layout",
        columns: 1,
        children: [
          { type: "group", children: [{ type: "field", path: "first" }] },
          {
            type: "layout",
            columns: 2,
            children: [
              { type: "field", path: "second", span: 1 },
              { type: "field", path: "third", span: 1 },
            ],
          },
        ],
      },
    }),
  }),
  Object.freeze({
    id: "supported.required-select",
    schemaText: json({
      type: "object",
      properties: {
        country: { type: "string", title: "国家", enum: ["CN", "US"], default: "CN" },
      },
      required: ["country"],
    }),
    uiSchemaText: json({
      fields: {
        country: { widget: "select", display: { label: "国家" } },
      },
    }),
  }),
  Object.freeze({
    id: "supported.required-and-visible",
    schemaText: json({
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    }),
    uiSchemaText: json({
      fields: {
        name: { widget: "text", behavior: { visible: true } },
      },
    }),
  }),
  Object.freeze({
    id: "supported.duplicate-key-source",
    schemaText: json({
      type: "object",
      properties: {
        country: { type: "string" },
        city: { type: "string" },
      },
    }),
    uiSchemaText: json({
      fields: {
        country: { widget: "text" },
        city: { widget: "text" },
      },
    }),
  }),
  Object.freeze({
    id: "supported.illegal-move-source",
    schemaText: json({
      type: "object",
      properties: {
        name: { type: "string" },
      },
    }),
    uiSchemaText: json({
      fields: { name: { widget: "text" } },
      layout: {
        type: "layout",
        columns: 1,
        children: [
          {
            type: "layout",
            columns: 1,
            children: [{ type: "field", path: "name" }],
          },
        ],
      },
    }),
  }),
]);

export const UNSUPPORTED_FIXTURES: readonly NamedFixture[] = Object.freeze([
  Object.freeze({
    id: "unsupported.syntax-error",
    schemaText: "{",
    uiSchemaText: json({ fields: {} }),
  }),
  Object.freeze({
    id: "unsupported.unknown-keyword",
    schemaText: json({
      type: "object",
      properties: { name: { type: "string" } },
      additionalProperties: false,
    }),
    uiSchemaText: json({ fields: { name: { widget: "text" } } }),
  }),
  Object.freeze({
    id: "unsupported.nested-object",
    schemaText: json({
      type: "object",
      properties: {
        address: { type: "object", properties: { city: { type: "string" } } },
      },
    }),
    uiSchemaText: json({ fields: {} }),
  }),
  Object.freeze({
    id: "unsupported.nested-array",
    schemaText: json({
      type: "object",
      properties: {
        tags: { type: "array", items: { type: "string" } },
      },
    }),
    uiSchemaText: json({ fields: {} }),
  }),
  Object.freeze({
    id: "unsupported.conditional",
    schemaText: json({
      type: "object",
      properties: { name: { type: "string" } },
      if: { properties: { name: { const: "Ada" } } },
      then: { required: ["name"] },
    }),
    uiSchemaText: json({ fields: { name: { widget: "text" } } }),
  }),
  Object.freeze({
    id: "unsupported.ref",
    schemaText: json({
      type: "object",
      $ref: "#/$defs/person",
      $defs: { person: { type: "object", properties: { name: { type: "string" } } } },
    }),
    uiSchemaText: json({ fields: {} }),
  }),
  Object.freeze({
    id: "unsupported.custom-widget",
    schemaText: json({
      type: "object",
      properties: { amount: { type: "number" } },
    }),
    uiSchemaText: json({
      fields: { amount: { widget: "company.currency" } },
    }),
  }),
  Object.freeze({
    id: "unsupported.custom-layout",
    schemaText: json({
      type: "object",
      properties: { name: { type: "string" } },
    }),
    uiSchemaText: json({
      fields: { name: { widget: "text" } },
      layout: { type: "object", children: [{ type: "field", path: "name" }] },
    }),
  }),
  Object.freeze({
    id: "unsupported.remaining-fields",
    schemaText: json({
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
    }),
    uiSchemaText: json({
      fields: {
        name: { widget: "text" },
        age: { widget: "number" },
      },
      layout: {
        type: "layout",
        columns: 1,
        children: [{ type: "field", path: "name" }, { type: "remaining-fields" }],
      },
    }),
  }),
  Object.freeze({
    id: "unsupported.duplicate-field-view",
    schemaText: json({
      type: "object",
      properties: { name: { type: "string" } },
    }),
    uiSchemaText: json({
      fields: { name: { widget: "text" } },
      layout: {
        type: "layout",
        columns: 1,
        children: [
          { type: "field", path: "name" },
          { type: "field", path: "name" },
        ],
      },
    }),
  }),
]);

export function getFixture(id: string): NamedFixture {
  const found = [...SUPPORTED_FIXTURES, ...UNSUPPORTED_FIXTURES].find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`unknown fixture ${id}`);
  }
  return found;
}
