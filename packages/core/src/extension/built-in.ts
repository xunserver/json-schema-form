import type {
  JsonValueType,
  WidgetCapabilities,
  WidgetDefinition,
  WidgetValueContract,
} from "./widget.js";
import { definePlugin } from "./plugin.js";

export const CORE_PLUGIN_ID = "core";

const EDITABLE: WidgetCapabilities = {
  readonly: true,
  disabled: true,
  clearable: true,
};

function scalar(jsonTypes: readonly JsonValueType[]): WidgetValueContract {
  return {
    jsonTypes,
    canonical: "json-scalar",
  };
}

function textWidget(name: "text" | "textarea", priority: number): WidgetDefinition {
  return {
    name,
    valueContract: scalar(["string"]),
    matchers: [{ schemaTypes: ["string"], priority }],
    capabilities: EDITABLE,
    defaults: { value: "" },
    propsContract: {
      properties: {
        placeholder: { type: "string" },
      },
    },
  };
}

const builtinWidgets: Readonly<Record<string, WidgetDefinition>> = {
  text: textWidget("text", 0),
  textarea: textWidget("textarea", -1),
  number: {
    name: "number",
    valueContract: scalar(["number", "integer"]),
    matchers: [{ schemaTypes: ["number", "integer"], priority: 0 }],
    capabilities: EDITABLE,
  },
  select: {
    name: "select",
    valueContract: scalar(["string", "number", "boolean", "integer"]),
    matchers: [{ enum: true, priority: 10 }],
    capabilities: EDITABLE,
  },
  "multi-select": {
    name: "multi-select",
    valueContract: {
      jsonTypes: ["array"],
      canonical: "readonly-collection",
    },
    matchers: [{ schemaTypes: ["array"], priority: 0 }],
    capabilities: {
      readonly: true,
      disabled: true,
      clearable: true,
      multiple: true,
    },
    defaults: { value: [] },
  },
  checkbox: {
    name: "checkbox",
    valueContract: scalar(["boolean"]),
    matchers: [{ schemaTypes: ["boolean"], priority: 0 }],
    capabilities: { disabled: true, inlineLabel: true },
    defaults: { value: false },
  },
  switch: {
    name: "switch",
    valueContract: scalar(["boolean"]),
    matchers: [{ schemaTypes: ["boolean"], priority: 1 }],
    capabilities: { disabled: true, inlineLabel: true },
    defaults: { value: false },
  },
  date: {
    name: "date",
    valueContract: {
      jsonTypes: ["string", "null"],
      canonical: "iso-date-string",
      nullable: true,
    },
    matchers: [{ schemaTypes: ["string"], formats: ["date"], priority: 20 }],
    capabilities: EDITABLE,
    defaults: { value: null },
  },
  datetime: {
    name: "datetime",
    valueContract: {
      jsonTypes: ["string", "null"],
      canonical: "iso-datetime-string",
      nullable: true,
    },
    matchers: [{ schemaTypes: ["string"], formats: ["date-time"], priority: 20 }],
    capabilities: EDITABLE,
    defaults: { value: null },
  },
};

export const coreBuiltInPlugin = definePlugin({
  id: CORE_PLUGIN_ID,
  protocol: { min: { major: 1, minor: 0 } },
  contributes: {
    widgets: builtinWidgets,
  },
});
