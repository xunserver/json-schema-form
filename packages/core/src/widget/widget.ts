export const BUILTIN_WIDGET_KEYS = [
  "text",
  "textarea",
  "number",
  "select",
  "multi-select",
  "checkbox",
  "switch",
  "date",
  "datetime",
] as const;

export type BuiltinWidgetKey = (typeof BUILTIN_WIDGET_KEYS)[number];

export const WIDGET_SEMANTIC_ACTIONS = ["setValue", "touch", "focus", "blur"] as const;

export type WidgetSemanticAction = (typeof WIDGET_SEMANTIC_ACTIONS)[number];

export type JsonValueType = "null" | "boolean" | "object" | "array" | "number" | "string" | "integer";

export type WidgetCanonicalValueKind =
  | "json-scalar"
  | "iso-date-string"
  | "iso-datetime-string"
  | "readonly-collection";

export interface WidgetValueContract {
  readonly jsonTypes: readonly JsonValueType[];
  readonly canonical: WidgetCanonicalValueKind;
  readonly nullable?: boolean;
}

export interface WidgetPropSchema {
  readonly type?: string;
}

export interface WidgetPropsContract {
  readonly properties?: Readonly<Record<string, WidgetPropSchema>>;
}

export interface WidgetMatcher {
  readonly schemaTypes?: readonly string[];
  readonly formats?: readonly string[];
  readonly enum?: boolean;
  readonly const?: boolean;
  readonly priority?: number;
}

export interface WidgetCapabilities {
  readonly readonly?: boolean;
  readonly disabled?: boolean;
  readonly clearable?: boolean;
  readonly multiple?: boolean;
  readonly inlineLabel?: boolean;
}

export interface WidgetDefaults {
  readonly value?: unknown;
  readonly props?: Readonly<Record<string, unknown>>;
}

export interface WidgetInteractionContract {
  readonly setValue: true;
  readonly touch?: true;
  readonly focus?: true;
  readonly blur?: true;
}

export const FULL_WIDGET_INTERACTION: WidgetInteractionContract = Object.freeze({
  setValue: true,
  touch: true,
  focus: true,
  blur: true,
});

export interface WidgetDefinition {
  readonly name: string;
  readonly valueContract: WidgetValueContract;
  readonly interaction: WidgetInteractionContract;
  readonly propsContract?: WidgetPropsContract;
  readonly matchers?: readonly WidgetMatcher[];
  readonly capabilities?: WidgetCapabilities;
  readonly defaults?: WidgetDefaults;
}

export type WidgetInteractionIssueReason =
  | "missing-interaction"
  | "missing-setValue"
  | "unknown-action"
  | "invalid-action-value"
  | "runtime-handler";

export type WidgetInteractionInspection =
  | { readonly ok: true; readonly actions: readonly WidgetSemanticAction[] }
  | { readonly ok: false; readonly reason: WidgetInteractionIssueReason; readonly action?: string };

const ACTION_SET = new Set<string>(WIDGET_SEMANTIC_ACTIONS);

export function inspectWidgetInteraction(value: unknown): WidgetInteractionInspection {
  if (containsFunction(value)) {
    return { ok: false, reason: "runtime-handler" };
  }
  if (!isRecord(value)) {
    return { ok: false, reason: "missing-interaction" };
  }
  if (value.setValue !== true) {
    return { ok: false, reason: "missing-setValue" };
  }

  const actions: WidgetSemanticAction[] = ["setValue"];
  for (const key of Object.keys(value)) {
    if (!ACTION_SET.has(key)) {
      return { ok: false, reason: "unknown-action", action: key };
    }
    if (value[key] !== true) {
      return { ok: false, reason: "invalid-action-value", action: key };
    }
    if (key !== "setValue") {
      actions.push(key as WidgetSemanticAction);
    }
  }
  return { ok: true, actions };
}

export function declaredWidgetActions(interaction: WidgetInteractionContract): readonly WidgetSemanticAction[] {
  const inspected = inspectWidgetInteraction(interaction);
  return inspected.ok ? inspected.actions : ["setValue"];
}

export function widgetDescriptorHasRuntimeHandler(value: unknown): boolean {
  return containsFunction(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsFunction(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === "function") {
    return true;
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsFunction(item, seen));
  }
  return Object.values(value).some((item) => containsFunction(item, seen));
}
