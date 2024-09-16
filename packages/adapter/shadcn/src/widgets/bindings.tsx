import { FULL_WIDGET_INTERACTION } from "@form/core/extension";
import type { WidgetBinding, WidgetRenderInput } from "@form/react";
import type { ShadcnAdapterComponents } from "../components.js";
import {
  createMultiSelectCodec,
  createSelectCodec,
  dateCodec,
  datetimeCodec,
  numberCodec,
  optionToken,
  stringCodec,
} from "./codecs.js";
import {
  applyCodecChange,
  checkboxBinding,
  describedBy,
  EDITABLE_CAPABILITIES,
  inputBinding,
  switchBinding,
  textareaBinding,
} from "./controlled.js";
import { mapShadcnProps } from "./mapper.js";

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

export function createWidgetBindings(
  components: ShadcnAdapterComponents,
): Readonly<Record<string, WidgetBinding>> {
  const {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectGroup,
    SelectValue,
    Combobox,
  } = components;

  const selectBinding: WidgetBinding = {
    codec: createSelectCodec([]),
    mapProps: mapShadcnProps,
    capabilities: EDITABLE_CAPABILITIES,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const options = optionsOf(input);
      const codec = createSelectCodec(options);
      const described = describedBy(input);
      const encoded = codec.encode(input.value);
      const value = typeof encoded === "string" && encoded !== "" ? encoded : null;
      return (
        <Select
          value={value}
          disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
          onValueChange={(next) => {
            applyCodecChange(input, codec, next);
          }}
        >
          <SelectTrigger
            {...input.nativeProps}
            id={input.ids.control}
            aria-labelledby={input.ids.label}
            aria-invalid={input.presentableErrors.length > 0}
            aria-required={input.fieldSnapshot.required}
            {...(described === undefined ? {} : { "aria-describedby": described })}
            onFocus={() => input.actions.focus()}
            onBlur={() => input.actions.blur()}
          >
            <SelectValue placeholder="" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((option, index) => {
                const token = optionToken(option.value, index);
                return (
                  <SelectItem key={token} value={token}>
                    {option.label}
                  </SelectItem>
                );
              })}
            </SelectGroup>
          </SelectContent>
        </Select>
      );
    },
  };

  const multiSelectBinding: WidgetBinding = {
    codec: createMultiSelectCodec([]),
    mapProps: mapShadcnProps,
    capabilities: { readonly: true, disabled: true, clearable: true, multiple: true },
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const options = optionsOf(input);
      const codec = createMultiSelectCodec(options);
      const encoded = codec.encode(input.value);
      const described = describedBy(input);
      const tokens = Array.isArray(encoded) ? encoded.filter((item): item is string => typeof item === "string") : [];
      return (
        <Combobox
          {...input.nativeProps}
          id={input.ids.control}
          value={tokens}
          disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
          aria-labelledby={input.ids.label}
          aria-invalid={input.presentableErrors.length > 0}
          aria-required={input.fieldSnapshot.required}
          {...(described === undefined ? {} : { "aria-describedby": described })}
          options={options.map((option, index) => ({
            value: optionToken(option.value, index),
            label: option.label,
          }))}
          onValueChange={(next) => {
            applyCodecChange(input, codec, next);
          }}
        />
      );
    },
  };

  return Object.freeze({
    text: inputBinding(components, stringCodec),
    textarea: textareaBinding(components, stringCodec),
    number: inputBinding(components, numberCodec),
    select: selectBinding,
    "multi-select": multiSelectBinding,
    checkbox: checkboxBinding(components),
    switch: switchBinding(components),
    date: inputBinding(components, dateCodec, "date"),
    datetime: inputBinding(components, datetimeCodec, "text"),
  });
}
