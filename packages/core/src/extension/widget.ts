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

export interface WidgetDefinition {
  readonly name: string;
  readonly valueContract: WidgetValueContract;
  readonly propsContract?: WidgetPropsContract;
  readonly matchers?: readonly WidgetMatcher[];
  readonly capabilities?: WidgetCapabilities;
  readonly defaults?: WidgetDefaults;
}
