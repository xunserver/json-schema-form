import type { FieldUI, LayoutNode, UISchema } from "@xunserver-jsf/core";
import { visualDiagnostic, VISUAL_DIAGNOSTIC_CODES, type VisualEditorDiagnostic } from "./diagnostics.js";
import {
  createVisualIdAllocator,
  freezeVisualDocument,
  isModelPathSafeKey,
  ROOT_EDITOR_NODE_ID,
  type EditorNodeId,
  type FieldPalette,
  type LayoutVariant,
  type VisualDocument,
  type VisualFieldConstraints,
  type VisualFieldNode,
  type VisualGroupNode,
  type VisualIdAllocator,
  type VisualLayoutNode,
  type VisualNode,
  type VisualRootNode,
  type VisualSchemaType,
  type VisualWidget,
} from "./model.js";

const DRAFT_2020_12_URIS = new Set([
  "https://json-schema.org/draft/2020-12/schema",
  "https://json-schema.org/draft/2020-12/schema#",
  "http://json-schema.org/draft/2020-12/schema",
  "http://json-schema.org/draft/2020-12/schema#",
]);

const ROOT_SCHEMA_KEYS = new Set(["$schema", "type", "title", "description", "properties", "required"]);
const FIELD_SCHEMA_KEYS = new Set([
  "type",
  "title",
  "description",
  "default",
  "enum",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "multipleOf",
]);
const UI_ROOT_KEYS = new Set(["fields", "layout"]);
const FIELD_UI_KEYS = new Set(["widget", "display", "behavior"]);
const DISPLAY_KEYS = new Set(["label", "help", "tooltip", "labelMode"]);
const BEHAVIOR_KEYS = new Set(["visible", "disabled", "readonly"]);
const LAYOUT_KEYS = new Set(["type", "path", "children", "columns", "span", "title", "description"]);
const SUPPORTED_WIDGETS = new Set<VisualWidget>(["text", "textarea", "number", "checkbox", "switch", "select"]);

export type VisualImportResult =
  | {
      readonly ok: true;
      readonly document: VisualDocument;
      readonly allocator: VisualIdAllocator;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly VisualEditorDiagnostic[];
    };

export function importVisualDocument(schemaText: string, uiSchemaText: string): VisualImportResult {
  const schemaParsed = parseObject(schemaText, "/schema");
  if (!schemaParsed.ok) {
    return schemaParsed;
  }
  const uiParsed = parseObject(uiSchemaText, "/uiSchema");
  if (!uiParsed.ok) {
    return uiParsed;
  }
  const diagnostics: VisualEditorDiagnostic[] = [];
  const schema = schemaParsed.value;
  const uiSchema = uiParsed.value as UISchema & Record<string, unknown>;

  rejectUnknownKeys(schema, ROOT_SCHEMA_KEYS, "/schema", diagnostics);
  if (schema.$schema !== undefined) {
    if (typeof schema.$schema !== "string" || !DRAFT_2020_12_URIS.has(schema.$schema)) {
      diagnostics.push(
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.unsupportedKeyword, "仅支持 Draft 2020-12 $schema", {
          jsonPointer: "/schema/$schema",
          property: "$schema",
        }),
      );
    }
  }
  if (schema.type !== "object") {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.unsupportedKeyword, "可视化编辑仅支持 root object Schema", {
        jsonPointer: "/schema/type",
        property: "type",
      }),
    );
  }
  if (!isPlainObject(schema.properties)) {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.unsupportedKeyword, "root object 必须声明 properties 对象", {
        jsonPointer: "/schema/properties",
        property: "properties",
      }),
    );
    return { ok: false, diagnostics };
  }

  const propertyOrder = Object.keys(schema.properties);
  const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : [];
  if (schema.required !== undefined && !Array.isArray(schema.required)) {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.unsupportedKeyword, "required 必须是字符串数组", {
        jsonPointer: "/schema/required",
        property: "required",
      }),
    );
  }

  const fieldInputs: VisualFieldNode[] = [];
  const allocator = createVisualIdAllocator(1);
  for (const key of propertyOrder) {
    const pointer = `/schema/properties/${escapePointer(key)}`;
    if (!isModelPathSafeKey(key)) {
      diagnostics.push(
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidKey, `property "${key}" 不能形成 ModelPath`, {
          jsonPointer: pointer,
          property: "key",
        }),
      );
      continue;
    }
    const propertySchema = schema.properties[key];
    if (!isPlainObject(propertySchema)) {
      diagnostics.push(
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.nestedSchema, "字段 Schema 必须是对象", { jsonPointer: pointer }),
      );
      continue;
    }
    const field = readFieldSchema(key, propertySchema, required.includes(key), allocator, pointer, diagnostics);
    if (field !== undefined) {
      fieldInputs.push(field);
    }
  }

  rejectUnknownKeys(uiSchema, UI_ROOT_KEYS, "/uiSchema", diagnostics);
  const fieldsUi = uiSchema.fields ?? {};
  if (uiSchema.fields !== undefined && !isPlainObject(uiSchema.fields)) {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.unsupportedKeyword, "uiSchema.fields 必须是对象", {
        jsonPointer: "/uiSchema/fields",
      }),
    );
  } else {
    for (const [path, fieldUI] of Object.entries(fieldsUi)) {
      const pointer = `/uiSchema/fields/${escapePointer(path)}`;
      const field = fieldInputs.find((item) => item.key === path);
      if (field === undefined) {
        diagnostics.push(
          visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.unsupportedKeyword, `fields 引用了不存在的字段 ${path}`, {
            jsonPointer: pointer,
          }),
        );
        continue;
      }
      applyFieldUI(field, fieldUI, pointer, diagnostics);
    }
  }

  const fieldsByKey = new Map(fieldInputs.map((field) => [field.key, field]));
  let children: VisualNode[];
  if (uiSchema.layout === undefined) {
    children = fieldInputs.map((field) => field);
  } else {
    const used = new Set<string>();
    const imported = importLayoutNode(uiSchema.layout, "/uiSchema/layout", allocator, fieldsByKey, used, diagnostics);
    if (imported === undefined) {
      children = [];
    } else if (imported.kind === "layout" && imported.variant === "stack" && imported.columns === 1) {
      children = [...imported.children];
    } else {
      children = [imported];
    }
    for (const key of propertyOrder) {
      if (!used.has(key) && fieldsByKey.has(key)) {
        diagnostics.push(
          visualDiagnostic(
            VISUAL_DIAGNOSTIC_CODES.remainingFields,
            `layout 未覆盖字段 ${key}；remaining-fields 不受支持`,
            { jsonPointer: "/uiSchema/layout", property: key },
          ),
        );
      }
    }
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  const root: VisualRootNode = {
    id: ROOT_EDITOR_NODE_ID,
    kind: "root",
    children,
    ...(typeof schema.title === "string" ? { title: schema.title } : {}),
    ...(typeof schema.description === "string" ? { description: schema.description } : {}),
  };
  return {
    ok: true,
    document: freezeVisualDocument({ version: 1, root }),
    allocator,
  };
}

function readFieldSchema(
  key: string,
  schema: Record<string, unknown>,
  required: boolean,
  allocator: VisualIdAllocator,
  pointer: string,
  diagnostics: VisualEditorDiagnostic[],
): VisualFieldNode | undefined {
  rejectUnknownKeys(schema, FIELD_SCHEMA_KEYS, pointer, diagnostics);
  const type = schema.type;
  if (type !== "string" && type !== "number" && type !== "integer" && type !== "boolean") {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.nestedSchema, "仅支持 string/number/integer/boolean 字段", {
        jsonPointer: `${pointer}/type`,
        property: "type",
      }),
    );
    return undefined;
  }
  let enumValues: string[] | undefined;
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum) || schema.enum.length === 0 || schema.enum.some((item) => typeof item !== "string")) {
      diagnostics.push(
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidEnum, "enum 必须是非空字符串数组", {
          jsonPointer: `${pointer}/enum`,
          property: "enum",
        }),
      );
    } else {
      enumValues = schema.enum as string[];
    }
  }
  const constraints: VisualFieldConstraints = {};
  copyConstraint(schema, constraints, "minLength");
  copyConstraint(schema, constraints, "maxLength");
  if (typeof schema.pattern === "string") {
    (constraints as { pattern?: string }).pattern = schema.pattern;
  }
  copyConstraint(schema, constraints, "minimum");
  copyConstraint(schema, constraints, "maximum");
  copyConstraint(schema, constraints, "multipleOf");
  const widget = inferWidget(type, enumValues);
  const field: VisualFieldNode = {
    id: allocator.next(),
    kind: "field",
    palette: paletteForWidget(widget),
    key,
    required,
    widget,
    schemaType: type,
    ...(typeof schema.title === "string" ? { title: schema.title } : {}),
    ...(typeof schema.description === "string" ? { description: schema.description } : {}),
    ...(schema.default !== undefined ? { defaultValue: schema.default } : {}),
    ...(enumValues !== undefined ? { enumValues } : {}),
    ...(Object.keys(constraints).length > 0 ? { constraints } : {}),
  };
  return field;
}

function applyFieldUI(
  field: VisualFieldNode,
  fieldUI: FieldUI,
  pointer: string,
  diagnostics: VisualEditorDiagnostic[],
): void {
  rejectUnknownKeys(fieldUI as Record<string, unknown>, FIELD_UI_KEYS, pointer, diagnostics);
  if (fieldUI.widget !== undefined) {
    if (!SUPPORTED_WIDGETS.has(fieldUI.widget as VisualWidget)) {
      diagnostics.push(
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.unsupportedWidget, `不支持的 Widget "${fieldUI.widget}"`, {
          jsonPointer: `${pointer}/widget`,
          property: "widget",
        }),
      );
    } else {
      (field as { widget: VisualWidget }).widget = fieldUI.widget as VisualWidget;
      (field as { palette: FieldPalette }).palette = paletteForWidget(fieldUI.widget as VisualWidget);
    }
  }
  if (fieldUI.display !== undefined) {
    rejectUnknownKeys(fieldUI.display as Record<string, unknown>, DISPLAY_KEYS, `${pointer}/display`, diagnostics);
    if (typeof fieldUI.display.label === "string" && field.title === undefined) {
      (field as { title?: string }).title = fieldUI.display.label;
    }
    if (typeof fieldUI.display.help === "string" && field.description === undefined) {
      (field as { description?: string }).description = fieldUI.display.help;
    }
  }
  if (fieldUI.behavior !== undefined) {
    rejectUnknownKeys(fieldUI.behavior as Record<string, unknown>, BEHAVIOR_KEYS, `${pointer}/behavior`, diagnostics);
    if (fieldUI.behavior.visible !== undefined) {
      (field as { visible?: boolean }).visible = fieldUI.behavior.visible;
    }
    if (fieldUI.behavior.disabled !== undefined) {
      (field as { disabled?: boolean }).disabled = fieldUI.behavior.disabled;
    }
    if (fieldUI.behavior.readonly !== undefined) {
      (field as { readonly?: boolean }).readonly = fieldUI.behavior.readonly;
    }
  }
}

function importLayoutNode(
  node: LayoutNode,
  pointer: string,
  allocator: VisualIdAllocator,
  fields: Map<string, VisualFieldNode>,
  used: Set<string>,
  diagnostics: VisualEditorDiagnostic[],
): VisualNode | undefined {
  rejectUnknownKeys(node as unknown as Record<string, unknown>, LAYOUT_KEYS, pointer, diagnostics);
  if (node.type === "remaining-fields") {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.remainingFields, "remaining-fields 不受支持", { jsonPointer: pointer }),
    );
    return undefined;
  }
  if (node.type === "object" || node.type === "array" || (node.type !== "field" && node.type !== "group" && node.type !== "layout")) {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.unsupportedLayout, `不支持的 layout type "${String(node.type)}"`, {
        jsonPointer: `${pointer}/type`,
        property: "type",
      }),
    );
    return undefined;
  }
  if (node.type === "field") {
    if (typeof node.path !== "string") {
      diagnostics.push(
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.unsupportedLayout, "field layout 必须包含 path", {
          jsonPointer: pointer,
          property: "path",
        }),
      );
      return undefined;
    }
    if (used.has(node.path)) {
      diagnostics.push(
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.duplicateFieldView, `字段 ${node.path} 出现了重复 field view`, {
          jsonPointer: pointer,
          property: "path",
        }),
      );
      return undefined;
    }
    const field = fields.get(node.path);
    if (field === undefined) {
      diagnostics.push(
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.unsupportedLayout, `layout 引用了未知字段 ${node.path}`, {
          jsonPointer: pointer,
          property: "path",
        }),
      );
      return undefined;
    }
    used.add(node.path);
    if (node.span !== undefined) {
      (field as { span?: number }).span = node.span;
    }
    return field;
  }
  const children = (node.children ?? []).flatMap((child, index) => {
    const imported = importLayoutNode(child, `${pointer}/children/${index}`, allocator, fields, used, diagnostics);
    return imported === undefined ? [] : [imported];
  });
  if (node.type === "group") {
    const group: VisualGroupNode = {
      id: allocator.next(),
      kind: "group",
      children,
      ...(typeof node.title === "string" && node.title !== "" ? { title: node.title } : {}),
      ...(typeof node.description === "string" && node.description !== "" ? { description: node.description } : {}),
      ...(node.span !== undefined ? { span: node.span } : {}),
    };
    return group;
  }
  const columns = node.columns ?? 1;
  const variant: LayoutVariant = columns <= 1 ? "stack" : columns === 2 ? "row" : "grid";
  const layout: VisualLayoutNode = {
    id: allocator.next(),
    kind: "layout",
    variant,
    columns,
    children,
    ...(node.span !== undefined ? { span: node.span } : {}),
  };
  return layout;
}

function inferWidget(type: VisualSchemaType, enumValues: readonly string[] | undefined): VisualWidget {
  if (enumValues !== undefined && enumValues.length > 0 && type === "string") {
    return "select";
  }
  if (type === "boolean") {
    return "checkbox";
  }
  if (type === "number" || type === "integer") {
    return "number";
  }
  return "text";
}

function paletteForWidget(widget: VisualWidget): FieldPalette {
  switch (widget) {
    case "text":
      return "text";
    case "textarea":
      return "textarea";
    case "number":
      return "number";
    case "checkbox":
    case "switch":
      return "boolean";
    case "select":
      return "select";
  }
}

function parseObject(
  text: string,
  pointer: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; diagnostics: readonly VisualEditorDiagnostic[] } {
  try {
    const value = JSON.parse(text) as unknown;
    if (!isPlainObject(value)) {
      return {
        ok: false,
        diagnostics: [
          visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.syntaxError, "必须是 JSON 对象", { jsonPointer: pointer }),
        ],
      };
    }
    return { ok: true, value };
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON 无效";
    return {
      ok: false,
      diagnostics: [visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.syntaxError, message, { jsonPointer: pointer })],
    };
  }
}

function rejectUnknownKeys(
  value: object,
  allowed: ReadonlySet<string>,
  pointer: string,
  diagnostics: VisualEditorDiagnostic[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      diagnostics.push(
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.unsupportedKeyword, `不支持的关键字 "${key}"`, {
          jsonPointer: `${pointer}/${escapePointer(key)}`,
          property: key,
        }),
      );
    }
  }
}

function copyConstraint(
  schema: Record<string, unknown>,
  constraints: VisualFieldConstraints,
  key: "minLength" | "maxLength" | "minimum" | "maximum" | "multipleOf",
): void {
  const value = schema[key];
  if (typeof value === "number") {
    (constraints as Record<string, number>)[key] = value;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escapePointer(token: string): string {
  return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function emptySupportedDefinitionTexts(): { readonly schemaText: string; readonly uiSchemaText: string } {
  return {
    schemaText: `${JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {},
      },
      null,
      2,
    )}\n`,
    uiSchemaText: `${JSON.stringify({ fields: {} }, null, 2)}\n`,
  };
}

export function visualSourceKey(schemaText: string, uiSchemaText: string): string {
  return `${schemaText}\0${uiSchemaText}`;
}

export function commitVisualIfFresh(input: {
  readonly sessionKey: string;
  readonly schemaText: string;
  readonly uiSchemaText: string;
}): { readonly ok: true } | { readonly ok: false; readonly diagnostics: readonly VisualEditorDiagnostic[] } {
  if (input.sessionKey !== visualSourceKey(input.schemaText, input.uiSchemaText)) {
    return {
      ok: false,
      diagnostics: [
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.staleSession, "可视化会话已过期，必须重新导入后才能提交"),
      ],
    };
  }
  return { ok: true };
}
