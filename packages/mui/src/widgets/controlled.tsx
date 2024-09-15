import { FULL_WIDGET_INTERACTION, type WidgetCapabilities } from "@form/core/extension";
import {
  freezeAdapterDiagnostic,
  RENDERER_DIAGNOSTIC_CODES,
  type CodecResult,
  type ValueCodec,
  type WidgetBinding,
  type WidgetRenderInput,
} from "@form/react";
import { mapMuiProps } from "./mapper.js";
import type { ChangeEvent, FocusEvent, ReactElement } from "react";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import Switch from "@mui/material/Switch";

export const EDITABLE_CAPABILITIES: WidgetCapabilities = Object.freeze({
  readonly: true,
  disabled: true,
  clearable: true,
});

export function applyCodecChange<T>(
  input: WidgetRenderInput,
  codec: ValueCodec<T>,
  native: unknown,
): void {
  if (input.fieldSnapshot.readonly || input.fieldSnapshot.disabled) {
    return;
  }
  const decoded = codec.decode(native) as CodecResult<T>;
  if (!decoded.ok) {
    input.reportDiagnostic(
      freezeAdapterDiagnostic({
        code: RENDERER_DIAGNOSTIC_CODES.CODEC_FAILURE,
        severity: "error",
        message: decoded.message,
        source: "adapter",
        pluginId: "mui",
        modelPath: input.field.path,
        metadata: {
          adapterId: "mui",
          key: input.field.widget,
          viewId: input.view.id,
        },
      }),
    );
    return;
  }
  input.actions.setValue(decoded.value);
}

export function describedBy(input: WidgetRenderInput): string | undefined {
  const ids = [
    input.field.display?.help === undefined ? undefined : input.ids.help,
    ...input.ids.errors,
  ].filter((id): id is string => id !== undefined);
  return ids.length === 0 ? undefined : ids.join(" ");
}

export function textFieldBinding(
  codec: ValueCodec,
  extra?: (input: WidgetRenderInput) => Record<string, unknown>,
): WidgetBinding {
  return {
    codec,
    mapProps: mapMuiProps,
    capabilities: EDITABLE_CAPABILITIES,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const encoded = codec.encode(input.value);
      const extraProps = extra === undefined ? {} : extra(input);
      const described = describedBy(input);
      return (
        <TextField
          {...input.nativeProps}
          {...extraProps}
          id={input.ids.control}
          value={encoded ?? ""}
          disabled={input.fieldSnapshot.disabled}
          required={input.fieldSnapshot.required}
          error={input.presentableErrors.length > 0}
          slotProps={{
            htmlInput: {
              readOnly: input.fieldSnapshot.readonly,
              "aria-labelledby": input.ids.label,
              "aria-invalid": input.presentableErrors.length > 0,
              "aria-required": input.fieldSnapshot.required,
              ...(described === undefined ? {} : { "aria-describedby": described }),
            },
          }}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            applyCodecChange(input, codec, event.target.value);
          }}
          onFocus={() => input.actions.focus()}
          onBlur={() => input.actions.blur()}
        />
      ) as ReactElement;
    },
  };
}

export function booleanControlBinding(
  Component: typeof Checkbox | typeof Switch,
  capabilities: WidgetCapabilities = { disabled: true, inlineLabel: true, readonly: true },
): WidgetBinding {
  return {
    codec: {
      encode: (canonical) => canonical === true,
      decode: (native) =>
        typeof native === "boolean"
          ? { ok: true, value: native }
          : { ok: false, code: "adapter.codec-failure", message: "Expected a boolean" },
    },
    mapProps: mapMuiProps,
    capabilities,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const described = describedBy(input);
      return (
        <Component
          {...input.nativeProps}
          id={input.ids.control}
          checked={input.value === true}
          disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
          inputProps={{
            "aria-labelledby": input.ids.label,
            "aria-invalid": input.presentableErrors.length > 0,
            "aria-required": input.fieldSnapshot.required,
            ...(described === undefined ? {} : { "aria-describedby": described }),
          }}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            applyCodecChange(input, booleanCodecAlias, event.target.checked);
          }}
          onFocus={(event: FocusEvent<HTMLButtonElement>) => {
            void event;
            input.actions.focus();
          }}
          onBlur={() => input.actions.blur()}
        />
      ) as ReactElement;
    },
  };
}

const booleanCodecAlias: ValueCodec = {
  encode: (canonical) => canonical === true,
  decode: (native) =>
    typeof native === "boolean"
      ? { ok: true, value: native }
      : { ok: false, code: "adapter.codec-failure", message: "Expected a boolean" },
};
