import type { FormDefinition, JsonSchema, JsonSchemaObject, LayoutNode, UISchema } from "@xunserver-jsf/core";
import type { WorkbenchDocument } from "../types.js";
import {
  collectFieldNodes,
  type VisualDocument,
  type VisualFieldNode,
  type VisualGroupNode,
  type VisualLayoutNode,
  type VisualNode,
} from "./model.js";

const DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema";

export interface WorkbenchExportSnapshot {
  readonly schemaText: string;
  readonly uiSchemaText: string;
  readonly definitionText: string;
  readonly schemaFileName: "schema.json";
  readonly uiSchemaFileName: "ui-schema.json";
  readonly definitionFileName: "form-definition.json";
  readonly mimeType: "application/json";
}

export function exportVisualSchemaText(document: VisualDocument): string {
  return formatJson(buildSchema(document));
}

export function exportVisualUiSchemaText(document: VisualDocument): string {
  return formatJson(buildUiSchema(document));
}

export function exportVisualDefinitionTexts(document: VisualDocument): {
  readonly schemaText: string;
  readonly uiSchemaText: string;
} {
  return {
    schemaText: exportVisualSchemaText(document),
    uiSchemaText: exportVisualUiSchemaText(document),
  };
}

export function exportWorkbenchSnapshots(workbench: WorkbenchDocument): WorkbenchExportSnapshot {
  const schema = JSON.parse(workbench.schemaText) as JsonSchema;
  const uiSchema = JSON.parse(workbench.uiSchemaText) as UISchema;
  const rules = JSON.parse(workbench.rulesText) as FormDefinition["rules"];
  const config = JSON.parse(workbench.configText) as FormDefinition["config"];
  const definition = {
    schema,
    uiSchema,
    rules,
    config,
  };
  return {
    schemaText: formatJson(schema),
    uiSchemaText: formatJson(uiSchema),
    definitionText: formatJson(definition),
    schemaFileName: "schema.json",
    uiSchemaFileName: "ui-schema.json",
    definitionFileName: "form-definition.json",
    mimeType: "application/json",
  };
}

export function buildSchema(document: VisualDocument): JsonSchemaObject {
  const fields = collectFieldNodes(document);
  const properties: Record<string, JsonSchemaObject> = {};
  for (const field of fields) {
    properties[field.key] = buildFieldSchema(field);
  }
  const required = fields.filter((field) => field.required).map((field) => field.key);
  const schema: JsonSchemaObject = {
    $schema: DRAFT_2020_12,
    type: "object",
    ...(document.root.title !== undefined ? { title: document.root.title } : {}),
    ...(document.root.description !== undefined ? { description: document.root.description } : {}),
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
  return schema;
}

export function buildUiSchema(document: VisualDocument): UISchema {
  const fields: Record<string, NonNullable<UISchema["fields"]>[string]> = {};
  for (const field of collectFieldNodes(document)) {
    fields[field.key] = buildFieldUI(field);
  }
  const layout = buildLayoutTree(document.root.children);
  return {
    fields,
    ...(layout !== undefined ? { layout } : {}),
  };
}

function buildFieldSchema(field: VisualFieldNode): JsonSchemaObject {
  const schema: Record<string, unknown> = {
    type: field.schemaType,
  };
  if (field.title !== undefined) {
    schema.title = field.title;
  }
  if (field.description !== undefined) {
    schema.description = field.description;
  }
  if (field.defaultValue !== undefined) {
    schema.default = field.defaultValue;
  }
  if (field.enumValues !== undefined && field.enumValues.length > 0) {
    schema.enum = [...field.enumValues];
  }
  const constraints = field.constraints;
  if (constraints !== undefined) {
    if (constraints.minLength !== undefined) {
      schema.minLength = constraints.minLength;
    }
    if (constraints.maxLength !== undefined) {
      schema.maxLength = constraints.maxLength;
    }
    if (constraints.pattern !== undefined) {
      schema.pattern = constraints.pattern;
    }
    if (constraints.minimum !== undefined) {
      schema.minimum = constraints.minimum;
    }
    if (constraints.maximum !== undefined) {
      schema.maximum = constraints.maximum;
    }
    if (constraints.multipleOf !== undefined) {
      schema.multipleOf = constraints.multipleOf;
    }
  }
  return schema as JsonSchemaObject;
}

function buildFieldUI(field: VisualFieldNode): NonNullable<UISchema["fields"]>[string] {
  const ui: Record<string, unknown> = {
    widget: field.widget,
  };
  const display: Record<string, string> = {};
  if (field.title !== undefined) {
    display.label = field.title;
  }
  if (field.description !== undefined) {
    display.help = field.description;
  }
  if (Object.keys(display).length > 0) {
    ui.display = display;
  }
  const behavior: Record<string, boolean> = {};
  if (field.visible !== undefined) {
    behavior.visible = field.visible;
  }
  if (field.disabled !== undefined) {
    behavior.disabled = field.disabled;
  }
  if (field.readonly !== undefined) {
    behavior.readonly = field.readonly;
  }
  if (Object.keys(behavior).length > 0) {
    ui.behavior = behavior;
  }
  return ui as NonNullable<UISchema["fields"]>[string];
}

function buildLayoutTree(children: readonly VisualNode[]): LayoutNode | undefined {
  if (children.length === 0) {
    return undefined;
  }
  return {
    type: "layout",
    columns: 1,
    children: children.map(buildLayoutNode),
  };
}

function buildLayoutNode(node: VisualNode): LayoutNode {
  if (node.kind === "field") {
    return {
      type: "field",
      path: node.key,
      ...(node.span !== undefined && node.span !== 1 ? { span: node.span } : {}),
    };
  }
  if (node.kind === "group") {
    return buildGroupNode(node);
  }
  return buildLayoutExport(node);
}

function buildGroupNode(node: VisualGroupNode): LayoutNode {
  return {
    type: "group",
    children: node.children.map(buildLayoutNode),
    ...(node.title !== undefined && node.title !== "" ? { title: node.title } : {}),
    ...(node.description !== undefined && node.description !== "" ? { description: node.description } : {}),
    ...(node.span !== undefined && node.span !== 1 ? { span: node.span } : {}),
  };
}

function buildLayoutExport(node: VisualLayoutNode): LayoutNode {
  return {
    type: "layout",
    columns: node.columns,
    children: node.children.map(buildLayoutNode),
    ...(node.span !== undefined && node.span !== 1 ? { span: node.span } : {}),
  };
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
