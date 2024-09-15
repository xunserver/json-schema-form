import type { FieldUI, LayoutNode, UISchema } from "../definition/ui-schema.js";
import type { FormEnvironment } from "../extension/environment.js";
import type { DataModel, DataNode, ObjectDataNode } from "../model/data.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../model/diagnostic-codes.js";
import type { FieldDescriptor, UIModel, ViewNode } from "../model/ui.js";
import { createReadonlyKeyedCollection } from "../model/readonly-collection.js";
import {
  ROOT_MODEL_PATH,
  isValidModelPath,
  modelPathStartsWith,
  toModelPath,
  type ModelPath,
} from "../path/index.js";
import { viewNodeId } from "./ids.js";
import { deepFreeze } from "./immutable.js";
import { DiagnosticBag, compilerError } from "./diagnostics.js";
import { compileNativeOptions } from "./ui/native.js";
import { resolveWidget } from "./ui/widget-resolver.js";

export function compileUIModel(
  data: DataModel,
  uiSchema: UISchema | undefined,
  environment: FormEnvironment,
  diagnostics: DiagnosticBag,
): UIModel {
  const fieldUIByPath = collectFieldUI(uiSchema, data, diagnostics);
  const fields = compileFields(data, fieldUIByPath, environment, diagnostics);
  const viewTree = uiSchema?.layout
    ? compileExplicitLayout(uiSchema.layout, data, fields, diagnostics)
    : compileDefaultView(data.root, fields, { current: 0 });

  return deepFreeze({
    fields,
    viewTree,
  });
}

function collectFieldUI(
  uiSchema: UISchema | undefined,
  data: DataModel,
  diagnostics: DiagnosticBag,
): Map<ModelPath, FieldUI> {
  const result = new Map<ModelPath, FieldUI>();
  const fields = uiSchema?.fields;
  if (fields === undefined) {
    return result;
  }

  for (const key of Object.keys(fields)) {
    const canonical = toModelPath(key);
    if (canonical === undefined || !isValidModelPath(key)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.UI_PATH_MISSING, `UI Schema field path is not a valid ModelPath: ${key}`, {
          metadata: { path: key, reason: "malformed" },
        }),
      );
      continue;
    }
    if (!data.nodes.has(canonical)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.UI_PATH_MISSING, `UI Schema field path does not exist: ${key}`, {
          modelPath: canonical,
          metadata: { path: key },
        }),
      );
      continue;
    }
    if (result.has(canonical)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.UI_PATH_MISSING, `Duplicate UI Schema field path: ${key}`, {
          modelPath: canonical,
        }),
      );
      continue;
    }
    result.set(canonical, fields[key]!);
  }

  return result;
}

function compileFields(
  data: DataModel,
  fieldUIByPath: Map<ModelPath, FieldUI>,
  environment: FormEnvironment,
  diagnostics: DiagnosticBag,
): UIModel["fields"] {
  const entries: Array<readonly [ModelPath, FieldDescriptor]> = [];

  for (const [path, node] of data.nodes) {
    const fieldUI = fieldUIByPath.get(path);
    if (fieldUI?.field === false) {
      if (fieldUI.widget !== undefined) {
        diagnostics.push(
          compilerError(
            COMPILER_DIAGNOSTIC_CODES.FIELD_WIDGET_CONFLICT,
            "field: false cannot be combined with an explicit widget",
            { modelPath: path },
          ),
        );
      }
      continue;
    }

    const wantsField = shouldProjectField(node, fieldUI);
    if (!wantsField) {
      continue;
    }

    const resolved = resolveWidget(node, fieldUI, environment, diagnostics, path);
    if (resolved === undefined) {
      continue;
    }

    const native = compileNativeOptions(fieldUI?.native, path, diagnostics);
    const descriptor: FieldDescriptor = {
      dataNodeId: node.id,
      path,
      widget: resolved.name,
      ...(fieldUI?.display === undefined ? {} : { display: fieldUI.display }),
      ...(fieldUI?.props === undefined ? {} : { props: fieldUI.props }),
      ...(fieldUI?.behavior === undefined ? {} : { behavior: fieldUI.behavior }),
      ...(native === undefined || Object.keys(native).length === 0 ? {} : { native }),
    };
    entries.push([path, descriptor]);
  }

  return createReadonlyKeyedCollection(entries);
}

function shouldProjectField(node: DataNode, fieldUI: FieldUI | undefined): boolean {
  if (node.kind === "recursive-ref" || node.kind === "never") {
    return false;
  }
  if (fieldUI?.widget !== undefined || fieldUI?.field === true) {
    return true;
  }
  if (node.kind === "scalar") {
    return true;
  }
  if (node.kind === "union") {
    return node.variants.every((variant) => variant.kind === "scalar" || variant.kind === "any");
  }
  return false;
}

function compileDefaultView(
  node: DataNode,
  fields: UIModel["fields"],
  occurrence: { current: number },
): ViewNode {
  const compiled = compileDefaultNode(node, fields, occurrence);
  return (
    compiled ?? {
      kind: "layout",
      id: nextViewId(occurrence, "layout", node.path),
      children: [],
    }
  );
}

function compileDefaultNode(
  node: DataNode,
  fields: UIModel["fields"],
  occurrence: { current: number },
): ViewNode | undefined {
  if (fields.has(node.path)) {
    return fieldView(node.path, occurrence);
  }
  if (node.kind === "object") {
    return {
      kind: "object",
      id: nextViewId(occurrence, "object", node.path),
      path: node.path,
      children: node.properties
        .map((property) => compileDefaultNode(property.node, fields, occurrence))
        .filter((child): child is ViewNode => child !== undefined),
    };
  }
  if (node.kind === "array") {
    const itemLayout: ViewNode[] = [];
    if (node.prefixItems !== undefined) {
      for (const slot of node.prefixItems) {
        const child = compileDefaultNode(slot, fields, occurrence);
        if (child !== undefined) {
          itemLayout.push(child);
        }
      }
    }
    if (node.items !== undefined) {
      const child = compileDefaultNode(node.items, fields, occurrence);
      if (child !== undefined) {
        itemLayout.push(child);
      }
    }
    return {
      kind: "array",
      id: nextViewId(occurrence, "array", node.path),
      path: node.path,
      itemLayout,
    };
  }
  if (node.kind === "union") {
    const children = node.variants
      .map((variant) => compileDefaultNode(variant, fields, occurrence))
      .filter((child): child is ViewNode => child !== undefined);
    if (children.length === 0) {
      return undefined;
    }
    return {
      kind: "group",
      id: nextViewId(occurrence, "group", node.path),
      children,
    };
  }
  return undefined;
}

function compileExplicitLayout(
  layout: LayoutNode,
  data: DataModel,
  fields: UIModel["fields"],
  diagnostics: DiagnosticBag,
): ViewNode {
  const occurrence = { current: 0 };
  const used = new Set<ModelPath>();
  const compiled = compileLayoutNode(layout, data, fields, diagnostics, occurrence, used, ROOT_MODEL_PATH);
  return compiled ?? {
    kind: "layout",
    id: nextViewId(occurrence, "layout", ""),
    children: [],
  };
}

function compileLayoutNode(
  layout: LayoutNode,
  data: DataModel,
  fields: UIModel["fields"],
  diagnostics: DiagnosticBag,
  occurrence: { current: number },
  used: Set<ModelPath>,
  scope: ModelPath,
): ViewNode | undefined {
  const type = layout.type;
  if (type === "remaining-fields") {
    return {
      kind: "group",
      id: nextViewId(occurrence, "group", "remaining"),
      children: remainingFields(scope, fields, used, occurrence),
    };
  }

  if (type === "field") {
    const path = resolveLayoutPath(layout.path, diagnostics, "field");
    if (path === undefined) {
      return undefined;
    }
    if (!fields.has(path)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.LAYOUT_INVALID, `Layout field reference is not a Field: ${layout.path}`, {
          modelPath: path,
        }),
      );
      return undefined;
    }
    used.add(path);
    return fieldView(path, occurrence);
  }

  if (type === "object") {
    const path = resolveLayoutPath(layout.path, diagnostics, "object") ?? ROOT_MODEL_PATH;
    const node = data.nodes.get(path);
    if (node === undefined || node.kind !== "object") {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.LAYOUT_INVALID, `Layout object reference is not an object DataNode`, {
          ...(path === ROOT_MODEL_PATH ? {} : { modelPath: path }),
        }),
      );
      return undefined;
    }
    return {
      kind: "object",
      id: nextViewId(occurrence, "object", path),
      path,
      children: compileLayoutChildren(layout.children, data, fields, diagnostics, occurrence, used, path),
    };
  }

  if (type === "array") {
    const path = resolveLayoutPath(layout.path, diagnostics, "array");
    if (path === undefined) {
      return undefined;
    }
    const node = data.nodes.get(path);
    if (node === undefined || node.kind !== "array") {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.LAYOUT_INVALID, `Layout array reference is not an array DataNode`, {
          modelPath: path,
        }),
      );
      return undefined;
    }
    const itemScope = node.items?.path ?? node.prefixItems?.[0]?.path ?? path;
    return {
      kind: "array",
      id: nextViewId(occurrence, "array", path),
      path,
      itemLayout: compileLayoutChildren(layout.children, data, fields, diagnostics, occurrence, used, itemScope),
    };
  }

  if (type === "group") {
    return {
      kind: "group",
      id: nextViewId(occurrence, "group", ""),
      children: compileLayoutChildren(layout.children, data, fields, diagnostics, occurrence, used, scope),
    };
  }

  if (type === "layout") {
    return {
      kind: "layout",
      id: nextViewId(occurrence, "layout", ""),
      ...(layout.columns === undefined ? {} : { columns: layout.columns }),
      ...(layout.span === undefined ? {} : { span: layout.span }),
      children: compileLayoutChildren(layout.children, data, fields, diagnostics, occurrence, used, scope),
    };
  }

  diagnostics.push(
    compilerError(COMPILER_DIAGNOSTIC_CODES.LAYOUT_INVALID, `Unsupported layout type: ${type}`, {
      metadata: { type },
    }),
  );
  return undefined;
}

function compileLayoutChildren(
  children: readonly LayoutNode[] | undefined,
  data: DataModel,
  fields: UIModel["fields"],
  diagnostics: DiagnosticBag,
  occurrence: { current: number },
  used: Set<ModelPath>,
  scope: ModelPath,
): ViewNode[] {
  if (children === undefined) {
    return [];
  }
  const compiled: ViewNode[] = [];
  for (const child of children) {
    if (child.type === "remaining-fields") {
      compiled.push(...remainingFields(scope, fields, used, occurrence));
      continue;
    }
    const node = compileLayoutNode(child, data, fields, diagnostics, occurrence, used, scope);
    if (node !== undefined) {
      compiled.push(node);
    }
  }
  return compiled;
}

function remainingFields(
  scope: ModelPath,
  fields: UIModel["fields"],
  used: Set<ModelPath>,
  occurrence: { current: number },
): ViewNode[] {
  const views: ViewNode[] = [];
  for (const [path] of fields) {
    if (used.has(path)) {
      continue;
    }
    if (!modelPathStartsWith(path, scope)) {
      continue;
    }
    used.add(path);
    views.push(fieldView(path, occurrence));
  }
  return views;
}

function resolveLayoutPath(
  path: string | undefined,
  diagnostics: DiagnosticBag,
  kind: string,
): ModelPath | undefined {
  if (path === undefined) {
    if (kind === "object") {
      return ROOT_MODEL_PATH;
    }
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.LAYOUT_INVALID, `Layout ${kind} node requires a path`, {
        metadata: { kind },
      }),
    );
    return undefined;
  }
  const canonical = toModelPath(path);
  if (canonical === undefined) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.LAYOUT_INVALID, `Layout path is not a valid ModelPath: ${path}`, {
        metadata: { path, kind },
      }),
    );
    return undefined;
  }
  return canonical;
}

function fieldView(path: ModelPath, occurrence: { current: number }): ViewNode {
  return {
    kind: "field",
    id: nextViewId(occurrence, "field", path),
    fieldPath: path,
  };
}

function nextViewId(occurrence: { current: number }, kind: string, detail: string) {
  const id = viewNodeId(occurrence.current, kind, detail);
  occurrence.current += 1;
  return id;
}

export function isObjectDataNode(node: DataNode): node is ObjectDataNode {
  return node.kind === "object";
}
