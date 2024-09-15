import type {
  BuiltinWidgetKey,
  WidgetDefinition,
  WidgetValueContract,
} from "../src/extension/widget.js";
import { BUILTIN_WIDGET_KEYS } from "../src/extension/widget.js";

const keys: Record<BuiltinWidgetKey, true> = {
  text: true,
  textarea: true,
  number: true,
  select: true,
  "multi-select": true,
  checkbox: true,
  switch: true,
  date: true,
  datetime: true,
};

void keys;
void BUILTIN_WIDGET_KEYS;

const dateValue: WidgetValueContract = {
  jsonTypes: ["string", "null"],
  canonical: "iso-date-string",
  nullable: true,
};

const datetimeValue: WidgetValueContract = {
  jsonTypes: ["string", "null"],
  canonical: "iso-datetime-string",
  nullable: true,
};

const multiSelectValue: WidgetValueContract = {
  jsonTypes: ["array"],
  canonical: "readonly-collection",
};

const scalarValue: WidgetValueContract = {
  jsonTypes: ["string"],
  canonical: "json-scalar",
};

const dateWidget: WidgetDefinition = {
  name: "date",
  valueContract: dateValue,
  interaction: { setValue: true, touch: true, focus: true, blur: true },
  capabilities: { clearable: true, readonly: true, disabled: true },
  defaults: { value: null },
};

const datetimeWidget: WidgetDefinition = {
  name: "datetime",
  valueContract: datetimeValue,
  interaction: { setValue: true, touch: true, focus: true, blur: true },
  capabilities: { clearable: true },
};

const multiSelectWidget: WidgetDefinition = {
  name: "multi-select",
  valueContract: multiSelectValue,
  interaction: { setValue: true, touch: true, focus: true, blur: true },
  capabilities: { multiple: true },
  defaults: { value: [] },
};

const textWidget: WidgetDefinition = {
  name: "text",
  valueContract: scalarValue,
  interaction: { setValue: true },
};

void dateWidget;
void datetimeWidget;
void multiSelectWidget;
void textWidget;

declare const widget: WidgetDefinition;

// @ts-expect-error Widget definition fields are readonly
widget.name = "other";

// @ts-expect-error Widget definition has no Vue/React component slot
widget.component = {};

type Canonical = WidgetValueContract["canonical"];
type DateCanonical = Extract<Canonical, "iso-date-string" | "iso-datetime-string" | "readonly-collection">;
const canonicals: DateCanonical = "iso-date-string";
void canonicals;
