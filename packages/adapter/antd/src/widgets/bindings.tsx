import { InputNumber, Select } from "antd";
import type { WidgetBinding, WidgetRenderInput } from "@form/react";
import { FULL_WIDGET_INTERACTION } from "@form/core/extension";
import type { CodecResult, ValueCodec } from "@form/react";
import {
  createMultiSelectCodec,
  createSelectCodec,
  dateCodec,
  datetimeCodec,
  optionToken,
  stringCodec,
} from "./codecs.js";
import {
  applyCodecChange,
  checkboxBinding as defineCheckboxBinding,
  describedBy,
  EDITABLE_CAPABILITIES,
  inputBinding,
  nativeInputBinding,
  switchBinding as defineSwitchBinding,
  textareaBinding as defineTextareaBinding,
} from "./controlled.js";
import { mapAntdProps } from "./mapper.js";

function fail(message: string): CodecResult<never> {
  return { ok: false, code: "adapter.codec-failure", message };
}

const inputNumberCodec: ValueCodec = {
  encode(canonical) {
    return typeof canonical === "number" && Number.isFinite(canonical) ? canonical : null;
  },
  decode(native) {
    if (native === null || native === undefined) {
      return { ok: true, value: null };
    }
    if (typeof native === "number") {
      return Number.isFinite(native) ? { ok: true, value: native } : fail("Expected a finite number or null");
    }
    return fail("Expected a finite number or null");
  },
};

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

export const textBinding = inputBinding(stringCodec);

export const textareaBinding = defineTextareaBinding(stringCodec);

export const numberBinding: WidgetBinding = {
  codec: inputNumberCodec,
  mapProps: mapAntdProps,
  capabilities: EDITABLE_CAPABILITIES,
  interaction: FULL_WIDGET_INTERACTION,
  render(input) {
    const encoded = inputNumberCodec.encode(input.value);
    const described = describedBy(input);
    return (
      <InputNumber
        {...input.nativeProps}
        id={input.ids.control}
        value={typeof encoded === "number" ? encoded : null}
        disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
        aria-labelledby={input.ids.label}
        aria-invalid={input.presentableErrors.length > 0}
        aria-required={input.fieldSnapshot.required}
        {...(described === undefined ? {} : { "aria-describedby": described })}
        onChange={(value: number | null) => {
          applyCodecChange(input, inputNumberCodec, value);
        }}
        onFocus={() => input.actions.focus()}
        onBlur={() => input.actions.blur()}
      />
    );
  },
};

export const selectBinding: WidgetBinding = {
  codec: createSelectCodec([]),
  mapProps: mapAntdProps,
  capabilities: EDITABLE_CAPABILITIES,
  interaction: FULL_WIDGET_INTERACTION,
  render(input) {
    const options = optionsOf(input);
    const codec = createSelectCodec(options);
    const described = describedBy(input);
    const encoded = codec.encode(input.value);
    return (
      <Select
        {...input.nativeProps}
        id={input.ids.control}
        value={typeof encoded === "string" && encoded !== "" ? encoded : null}
        disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
        aria-labelledby={input.ids.label}
        aria-invalid={input.presentableErrors.length > 0}
        aria-required={input.fieldSnapshot.required}
        {...(described === undefined ? {} : { "aria-describedby": described })}
        options={options.map((option, index) => ({
          label: option.label,
          value: optionToken(option.value, index),
        }))}
        onChange={(value: string) => {
          applyCodecChange(input, codec, value);
        }}
        onFocus={() => input.actions.focus()}
        onBlur={() => input.actions.blur()}
      />
    );
  },
};

export const multiSelectBinding: WidgetBinding = {
  codec: createMultiSelectCodec([]),
  mapProps: mapAntdProps,
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
        mode="multiple"
        id={input.ids.control}
        value={Array.isArray(encoded) ? encoded : []}
        disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
        aria-labelledby={input.ids.label}
        aria-invalid={input.presentableErrors.length > 0}
        aria-required={input.fieldSnapshot.required}
        {...(described === undefined ? {} : { "aria-describedby": described })}
        options={options.map((option, index) => ({
          label: option.label,
          value: optionToken(option.value, index),
        }))}
        onChange={(value: string[]) => {
          applyCodecChange(input, codec, value);
        }}
        onFocus={() => input.actions.focus()}
        onBlur={() => input.actions.blur()}
      />
    );
  },
};

export const checkboxBinding = defineCheckboxBinding();

export const switchBinding = defineSwitchBinding();

export const dateBinding = nativeInputBinding(dateCodec, "date");

export const datetimeBinding = nativeInputBinding(datetimeCodec, "text");

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
