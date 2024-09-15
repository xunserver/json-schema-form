import type { ArrayView, Diagnostic, FieldDescriptor, ModelPath, ViewNode, ViewNodeId } from "@form/core";
import type { FormInstance } from "@form/core";
import { RENDERER_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { freezeAdapterDiagnostic, RendererCapabilityError } from "./errors.js";
import type { LayoutKind, ResolvedReactAdapter, WidgetBinding } from "./types.js";

export interface CapabilityNeed {
  readonly kind: "widget" | "layout";
  readonly key: string;
  readonly viewId: ViewNodeId;
  readonly modelPath?: ModelPath;
  readonly readonly?: boolean;
  readonly disabled?: boolean;
  readonly multiple?: boolean;
  readonly accessibility?: boolean;
}

export function collectCapabilityNeeds(form: FormInstance): readonly CapabilityNeed[] {
  const needs: CapabilityNeed[] = [];
  walk(form.model.ui.viewTree, form, needs);
  return needs;
}

export function preflightCapabilities(
  form: FormInstance,
  adapter: ResolvedReactAdapter,
  report?: (diagnostic: Diagnostic) => void,
): void {
  const diagnostics: Diagnostic[] = [];
  for (const need of collectCapabilityNeeds(form)) {
    if (need.kind === "layout") {
      if (!adapter.layouts.has(need.key)) {
        diagnostics.push(missing(adapter.id, need, "layout"));
      }
      continue;
    }
    const binding = adapter.widgets.get(need.key);
    if (binding === undefined) {
      diagnostics.push(missing(adapter.id, need, "widget"));
      continue;
    }
    const capabilityIssues = inspectWidgetCapability(binding, need);
    for (const issue of capabilityIssues) {
      diagnostics.push(issueDiagnostic(adapter.id, need, issue));
    }
  }
  if (diagnostics.length === 0) {
    return;
  }
  for (const diagnostic of diagnostics) {
    report?.(diagnostic);
  }
  throw new RendererCapabilityError(diagnostics);
}

function walk(node: ViewNode, form: FormInstance, needs: CapabilityNeed[]): void {
  if (node.kind === "field") {
    const field = form.model.ui.fields.get(node.fieldPath);
    if (field === undefined) {
      return;
    }
    needs.push(widgetNeed(node.id, field));
    return;
  }
  needs.push({
    kind: "layout",
    key: layoutKey(node.kind),
    viewId: node.id,
    ...("path" in node ? { modelPath: node.path } : {}),
  });
  const children = node.kind === "array" ? (node as ArrayView).itemLayout : node.children;
  for (const child of children) {
    walk(child, form, needs);
  }
}

function widgetNeed(viewId: ViewNodeId, field: FieldDescriptor): CapabilityNeed {
  return {
    kind: "widget",
    key: field.widget,
    viewId,
    modelPath: field.path,
    readonly: field.behavior?.readonly === true,
    disabled: field.behavior?.disabled === true,
    multiple: field.widget === "multi-select",
    accessibility: true,
  };
}

function layoutKey(kind: ViewNode["kind"]): LayoutKind {
  return kind === "field" ? "object" : kind;
}

function inspectWidgetCapability(binding: WidgetBinding, need: CapabilityNeed): string[] {
  const issues: string[] = [];
  if (typeof binding.codec?.encode !== "function" || typeof binding.codec?.decode !== "function") {
    issues.push("codec");
  }
  if (binding.custom !== true && typeof binding.mapProps !== "function") {
    issues.push("mapProps");
  }
  if (binding.interaction?.setValue !== true) {
    issues.push("interaction.setValue");
  }
  if (need.readonly === true && binding.capabilities?.readonly !== true) {
    issues.push("capability.readonly");
  }
  if (need.disabled === true && binding.capabilities?.disabled !== true) {
    issues.push("capability.disabled");
  }
  if (need.multiple === true && binding.capabilities?.multiple !== true) {
    issues.push("capability.multiple");
  }
  return issues;
}

function missing(adapterId: string, need: CapabilityNeed, kind: "widget" | "layout"): Diagnostic {
  return freezeAdapterDiagnostic({
    code: RENDERER_DIAGNOSTIC_CODES.MISSING_CAPABILITY,
    severity: "error",
    message: `Adapter "${adapterId}" has no ${kind} binding for "${need.key}"`,
    source: "adapter",
    pluginId: adapterId,
    ...(need.modelPath === undefined ? {} : { modelPath: need.modelPath }),
    metadata: {
      adapterId,
      key: need.key,
      viewId: need.viewId,
      kind,
    },
  });
}

function issueDiagnostic(adapterId: string, need: CapabilityNeed, issue: string): Diagnostic {
  return freezeAdapterDiagnostic({
    code: RENDERER_DIAGNOSTIC_CODES.MISSING_CAPABILITY,
    severity: "error",
    message: `Adapter "${adapterId}" binding "${need.key}" is missing ${issue}`,
    source: "adapter",
    pluginId: adapterId,
    ...(need.modelPath === undefined ? {} : { modelPath: need.modelPath }),
    metadata: {
      adapterId,
      key: need.key,
      viewId: need.viewId,
      issue,
    },
  });
}
