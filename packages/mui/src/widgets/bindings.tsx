import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Checkbox from "@mui/material/Checkbox";
import Switch from "@mui/material/Switch";
import type { WidgetBinding, WidgetRenderInput } from "@form/react";
import { FULL_WIDGET_INTERACTION } from "@form/core/extension";
import {
  createMultiSelectCodec,
  createSelectCodec,
  dateCodec,
  datetimeCodec,
  numberCodec,
  stringCodec,
} from "./codecs.js";
import { applyCodecChange, booleanControlBinding, describedBy, EDITABLE_CAPABILITIES, textFieldBinding } from "./controlled.js";
import { mapMuiProps } from "./mapper.js";

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

export const textBinding = textFieldBinding(stringCodec);

export const textareaBinding = textFieldBinding(stringCodec, () => ({ multiline: true, minRows: 3 }));

export const numberBinding = textFieldBinding(numberCodec, () => ({ type: "number" }));

export const selectBinding: WidgetBinding = {
  codec: createSelectCodec([]),
  mapProps: mapMuiProps,
  capabilities: EDITABLE_CAPABILITIES,
  interaction: FULL_WIDGET_INTERACTION,
  render(input) {
    const options = optionsOf(input);
    const codec = createSelectCodec(options);
    const described = describedBy(input);
    return (
      <Select
        {...input.nativeProps}
        id={input.ids.control}
        value={codec.encode(input.value)}
        disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
        inputProps={{
          "aria-labelledby": input.ids.label,
          "aria-invalid": input.presentableErrors.length > 0,
          "aria-required": input.fieldSnapshot.required,
          ...(described === undefined ? {} : { "aria-describedby": described }),
        }}
        onChange={(event: SelectChangeEvent<unknown>) => {
          applyCodecChange(input, codec, event.target.value);
        }}
        onFocus={() => input.actions.focus()}
        onBlur={() => input.actions.blur()}
      >
        {options.map((option, index) => (
          <MenuItem key={`opt:${index}:${typeof option.value}`} value={`opt:${index}:${typeof option.value}`}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    );
  },
};

export const multiSelectBinding: WidgetBinding = {
  codec: createMultiSelectCodec([]),
  mapProps: mapMuiProps,
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
        id={input.ids.control}
        multiple
        value={Array.isArray(encoded) ? encoded : []}
        disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
        inputProps={{
          "aria-labelledby": input.ids.label,
          "aria-invalid": input.presentableErrors.length > 0,
          "aria-required": input.fieldSnapshot.required,
          ...(described === undefined ? {} : { "aria-describedby": described }),
        }}
        onChange={(event: SelectChangeEvent<unknown>) => {
          applyCodecChange(input, codec, event.target.value);
        }}
        onFocus={() => input.actions.focus()}
        onBlur={() => input.actions.blur()}
      >
        {options.map((option, index) => (
          <MenuItem key={`opt:${index}:${typeof option.value}`} value={`opt:${index}:${typeof option.value}`}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
    );
  },
};

export const checkboxBinding = booleanControlBinding(Checkbox);

export const switchBinding = booleanControlBinding(Switch);

export const dateBinding = textFieldBinding(dateCodec, () => ({ type: "date" }));

export const datetimeBinding = textFieldBinding(datetimeCodec, () => ({ type: "text" }));

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
