import { ElCheckbox, ElDatePicker, ElInput, ElInputNumber, ElOption, ElSelect, ElSwitch } from "element-plus";
import { h, type Component } from "vue";
import type { WidgetBinding, WidgetRenderInput } from "@form/vue";
import {
  booleanCodec,
  dateCodec,
  datetimeCodec,
  multiSelectCodec,
  numberCodec,
  selectCodec,
  stringCodec,
} from "./codecs.js";
import { applyCodecChange, controlledWidget, describedBy, EDITABLE_CAPABILITIES } from "./controlled.js";
import { mapElementPlusProps } from "./mapper.js";
import { FULL_WIDGET_INTERACTION } from "@form/core/extension";

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

function optionNode(option: { readonly value: string | number | boolean; readonly label: string }) {
  return h(ElOption as Component, {
    key: String(option.value),
    value: option.value,
    label: option.label,
  });
}

function selectProps(input: WidgetRenderInput, modelValue: unknown, multiple = false): Record<string, unknown> {
  const described = describedBy(input);
  const props: Record<string, unknown> = {
    ...input.nativeProps,
    id: input.ids.control,
    modelValue,
    disabled: input.fieldSnapshot.disabled,
    "aria-labelledby": input.ids.label,
    "aria-invalid": input.presentableErrors.length > 0,
    "aria-required": input.fieldSnapshot.required,
    onFocus: () => input.actions.focus(),
    onBlur: () => input.actions.blur(),
  };
  if (multiple) {
    props.multiple = true;
  }
  if (described !== undefined) {
    props["aria-describedby"] = described;
  }
  return props;
}

export const textBinding = controlledWidget(ElInput, stringCodec);

export const textareaBinding = controlledWidget(ElInput, stringCodec, () => ({ type: "textarea" }));

export const numberBinding = controlledWidget(ElInputNumber, numberCodec, () => ({ controls: true }));

export const selectBinding: WidgetBinding = {
  codec: selectCodec,
  mapProps: mapElementPlusProps,
  capabilities: EDITABLE_CAPABILITIES,
  interaction: FULL_WIDGET_INTERACTION,
  render(input) {
    return h(
      ElSelect,
      {
        ...selectProps(input, selectCodec.encode(input.value)),
        "onUpdate:modelValue": (value: unknown) => applyCodecChange(input, selectCodec, value),
      },
      () => optionsOf(input).map(optionNode),
    );
  },
};

export const multiSelectBinding: WidgetBinding = {
  codec: multiSelectCodec,
  mapProps: mapElementPlusProps,
  capabilities: { readonly: true, disabled: true, clearable: true, multiple: true },
  interaction: FULL_WIDGET_INTERACTION,
  render(input) {
    const encoded = multiSelectCodec.encode(input.value);
    return h(
      ElSelect,
      {
        ...selectProps(input, Array.isArray(encoded) ? [...encoded] : [], true),
        "onUpdate:modelValue": (value: unknown) => applyCodecChange(input, multiSelectCodec, value),
      },
      () => optionsOf(input).map(optionNode),
    );
  },
};

export const checkboxBinding = controlledWidget(ElCheckbox, booleanCodec, () => ({}), {
  disabled: true,
  inlineLabel: true,
});

export const switchBinding = controlledWidget(ElSwitch, booleanCodec, () => ({}), {
  disabled: true,
  inlineLabel: true,
});

export const dateBinding = controlledWidget(ElDatePicker, dateCodec, () => ({
  type: "date",
  valueFormat: "YYYY-MM-DD",
}));

export const datetimeBinding = controlledWidget(ElDatePicker, datetimeCodec, () => ({
  type: "datetime",
  valueFormat: "YYYY-MM-DDTHH:mm:ssZ",
}));

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
