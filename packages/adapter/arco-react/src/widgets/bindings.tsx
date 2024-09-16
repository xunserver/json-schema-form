import { Checkbox, Input, InputNumber, Select, Switch } from "@arco-design/web-react";
import type { WidgetBinding, WidgetRenderInput } from "@xunserver-jsf/react";
import { FULL_WIDGET_INTERACTION } from "@xunserver-jsf/core/extension";
import {
  createMultiSelectCodec,
  createSelectCodec,
  dateCodec,
  datetimeCodec,
  numberCodec,
  stringCodec,
} from "./codecs.js";
import {
  applyCodecChange,
  arcoInputBinding,
  booleanControlBinding,
  describedBy,
  EDITABLE_CAPABILITIES,
  fullWidthStyle,
  nativeInputBinding,
} from "./controlled.js";
import { mapArcoReactProps } from "./mapper.js";

function optionsOf(
  input: WidgetRenderInput,
): readonly { readonly value: string | number | boolean; readonly label: string }[] {
  const options = input.field.props?.options;
  if (!Array.isArray(options)) {
    return [];
  }
  const result: { readonly value: string | number | boolean; readonly label: string }[] = [];
  for (const option of options) {
    if (option !== null && typeof option === "object" && "value" in option) {
      const record = option as { value: unknown; label?: unknown };
      if (typeof record.value === "string" || typeof record.value === "number" || typeof record.value === "boolean") {
        result.push({
          value: record.value,
          label: typeof record.label === "string" ? record.label : String(record.value),
        });
      }
      continue;
    }
    if (typeof option === "string" || typeof option === "number" || typeof option === "boolean") {
      result.push({ value: option, label: String(option) });
    }
  }
  return result;
}

export const textBinding = arcoInputBinding(stringCodec);

export const textareaBinding = arcoInputBinding(stringCodec, () => ({ autoSize: { minRows: 3 } }), Input.TextArea);

export const numberBinding: WidgetBinding = {
  codec: numberCodec,
  mapProps: mapArcoReactProps,
  capabilities: EDITABLE_CAPABILITIES,
  interaction: FULL_WIDGET_INTERACTION,
  render(input) {
    const described = describedBy(input);
    const numericValue =
      typeof input.value === "number" && Number.isFinite(input.value) ? input.value : undefined;
    return (
      <InputNumber
        {...input.nativeProps}
        style={fullWidthStyle(input.nativeProps)}
        id={input.ids.control}
        value={numericValue}
        disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
        aria-labelledby={input.ids.label}
        aria-invalid={input.presentableErrors.length > 0}
        aria-required={input.fieldSnapshot.required}
        {...(described === undefined ? {} : { "aria-describedby": described })}
        onChange={(value: number | undefined) => {
          applyCodecChange(input, numberCodec, value ?? "");
        }}
        onFocus={() => input.actions.focus()}
        onBlur={() => input.actions.blur()}
      />
    );
  },
};

export const selectBinding: WidgetBinding = {
  codec: createSelectCodec([]),
  mapProps: mapArcoReactProps,
  capabilities: EDITABLE_CAPABILITIES,
  interaction: FULL_WIDGET_INTERACTION,
  render(input) {
    const options = optionsOf(input);
    const codec = createSelectCodec(options);
    const described = describedBy(input);
    const encoded = codec.encode(input.value);
    const selectValue = typeof encoded === "string" ? encoded : "";
    return (
      <Select
        {...input.nativeProps}
        style={fullWidthStyle(input.nativeProps)}
        id={input.ids.control}
        value={selectValue}
        disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
        aria-labelledby={input.ids.label}
        aria-invalid={input.presentableErrors.length > 0}
        aria-required={input.fieldSnapshot.required}
        {...(described === undefined ? {} : { "aria-describedby": described })}
        onChange={(value) => {
          applyCodecChange(input, codec, value);
        }}
        onFocus={() => input.actions.focus()}
        onBlur={() => input.actions.blur()}
      >
        {options.map((option, index) => (
          <Select.Option key={`opt:${index}:${typeof option.value}`} value={`opt:${index}:${typeof option.value}`}>
            {option.label}
          </Select.Option>
        ))}
      </Select>
    );
  },
};

export const multiSelectBinding: WidgetBinding = {
  codec: createMultiSelectCodec([]),
  mapProps: mapArcoReactProps,
  capabilities: { readonly: true, disabled: true, clearable: true, multiple: true },
  interaction: FULL_WIDGET_INTERACTION,
  render(input) {
    const options = optionsOf(input);
    const codec = createMultiSelectCodec(options);
    const encoded = codec.encode(input.value);
    const described = describedBy(input);
    return (
      <Select
        {...input.nativeProps}
        style={fullWidthStyle(input.nativeProps)}
        id={input.ids.control}
        mode="multiple"
        value={Array.isArray(encoded) ? encoded : []}
        disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
        aria-labelledby={input.ids.label}
        aria-invalid={input.presentableErrors.length > 0}
        aria-required={input.fieldSnapshot.required}
        {...(described === undefined ? {} : { "aria-describedby": described })}
        onChange={(value) => {
          applyCodecChange(input, codec, value);
        }}
        onFocus={() => input.actions.focus()}
        onBlur={() => input.actions.blur()}
      >
        {options.map((option, index) => (
          <Select.Option key={`opt:${index}:${typeof option.value}`} value={`opt:${index}:${typeof option.value}`}>
            {option.label}
          </Select.Option>
        ))}
      </Select>
    );
  },
};

export const checkboxBinding = booleanControlBinding(Checkbox);

export const switchBinding = booleanControlBinding(Switch);

export const dateBinding = nativeInputBinding(dateCodec, () => ({ type: "date" }));

export const datetimeBinding = nativeInputBinding(datetimeCodec, () => ({ type: "text" }));

export const widgetBindings: Readonly<Record<string, WidgetBinding>> = Object.freeze({
  text: textBinding,
  textarea: textareaBinding,
  number: numberBinding,
  select: selectBinding,
  "multi-select": multiSelectBinding,
  checkbox: checkboxBinding,
  switch: switchBinding,
  date: dateBinding,
  datetime: datetimeBinding,
});
