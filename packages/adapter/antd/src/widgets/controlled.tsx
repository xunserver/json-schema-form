import { FULL_WIDGET_INTERACTION, type WidgetCapabilities } from "@xunserver-jsf/core/extension";
import {
  freezeAdapterDiagnostic,
  RENDERER_DIAGNOSTIC_CODES,
  type CodecResult,
  type ValueCodec,
  type WidgetBinding,
  type WidgetRenderInput,
} from "@xunserver-jsf/react";
import { Checkbox, Input, Switch } from "antd";
import { mapAntdProps } from "./mapper.js";
import type { ChangeEvent, FocusEvent, ReactElement } from "react";

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
        pluginId: "antd",
        modelPath: input.field.path,
        metadata: {
          adapterId: "antd",
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

export function inputBinding(
  codec: ValueCodec,
  extra?: (input: WidgetRenderInput) => Record<string, unknown>,
): WidgetBinding {
  return {
    codec,
    mapProps: mapAntdProps,
    capabilities: EDITABLE_CAPABILITIES,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const encoded = codec.encode(input.value);
      const extraProps = extra === undefined ? {} : extra(input);
      const described = describedBy(input);
      return (
        <Input
          {...input.nativeProps}
          {...extraProps}
          id={input.ids.control}
          value={typeof encoded === "string" || typeof encoded === "number" ? encoded : ""}
          disabled={input.fieldSnapshot.disabled}
          readOnly={input.fieldSnapshot.readonly}
          aria-labelledby={input.ids.label}
          aria-invalid={input.presentableErrors.length > 0}
          aria-required={input.fieldSnapshot.required}
          {...(described === undefined ? {} : { "aria-describedby": described })}
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

export function textareaBinding(codec: ValueCodec): WidgetBinding {
  return {
    codec,
    mapProps: mapAntdProps,
    capabilities: EDITABLE_CAPABILITIES,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const encoded = codec.encode(input.value);
      const described = describedBy(input);
      return (
        <Input.TextArea
          {...input.nativeProps}
          id={input.ids.control}
          value={typeof encoded === "string" || typeof encoded === "number" ? encoded : ""}
          disabled={input.fieldSnapshot.disabled}
          readOnly={input.fieldSnapshot.readonly}
          rows={3}
          aria-labelledby={input.ids.label}
          aria-invalid={input.presentableErrors.length > 0}
          aria-required={input.fieldSnapshot.required}
          {...(described === undefined ? {} : { "aria-describedby": described })}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            applyCodecChange(input, codec, event.target.value);
          }}
          onFocus={() => input.actions.focus()}
          onBlur={() => input.actions.blur()}
        />
      ) as ReactElement;
    },
  };
}

export function nativeInputBinding(codec: ValueCodec, type: "date" | "text"): WidgetBinding {
  return {
    codec,
    mapProps: mapAntdProps,
    capabilities: EDITABLE_CAPABILITIES,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const encoded = codec.encode(input.value);
      const described = describedBy(input);
      const stringValue = typeof encoded === "string" ? encoded : "";
      return (
        <input
          {...input.nativeProps}
          type={type}
          id={input.ids.control}
          value={stringValue}
          disabled={input.fieldSnapshot.disabled}
          readOnly={input.fieldSnapshot.readonly}
          aria-labelledby={input.ids.label}
          aria-invalid={input.presentableErrors.length > 0}
          aria-required={input.fieldSnapshot.required}
          {...(described === undefined ? {} : { "aria-describedby": described })}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            applyCodecChange(input, codec, event.target.value);
          }}
          onFocus={() => input.actions.focus()}
          onBlur={() => input.actions.blur()}
        />
      );
    },
  };
}

export function checkboxBinding(
  capabilities: WidgetCapabilities = { disabled: true, inlineLabel: true, readonly: true },
): WidgetBinding {
  return {
    codec: booleanCodecAlias,
    mapProps: mapAntdProps,
    capabilities,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const described = describedBy(input);
      return (
        <Checkbox
          {...input.nativeProps}
          id={input.ids.control}
          checked={input.value === true}
          disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
          aria-labelledby={input.ids.label}
          aria-invalid={input.presentableErrors.length > 0}
          aria-required={input.fieldSnapshot.required}
          {...(described === undefined ? {} : { "aria-describedby": described })}
          onChange={(event) => {
            applyCodecChange(input, booleanCodecAlias, event.target.checked);
          }}
          onFocus={(event: FocusEvent<HTMLInputElement>) => {
            void event;
            input.actions.focus();
          }}
          onBlur={() => input.actions.blur()}
        />
      ) as ReactElement;
    },
  };
}

export function switchBinding(
  capabilities: WidgetCapabilities = { disabled: true, inlineLabel: true, readonly: true },
): WidgetBinding {
  return {
    codec: booleanCodecAlias,
    mapProps: mapAntdProps,
    capabilities,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const described = describedBy(input);
      return (
        <Switch
          {...input.nativeProps}
          id={input.ids.control}
          checked={input.value === true}
          disabled={input.fieldSnapshot.disabled || input.fieldSnapshot.readonly}
          aria-labelledby={input.ids.label}
          aria-invalid={input.presentableErrors.length > 0}
          aria-required={input.fieldSnapshot.required}
          {...(described === undefined ? {} : { "aria-describedby": described })}
          onChange={(checked: boolean) => {
            applyCodecChange(input, booleanCodecAlias, checked);
          }}
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
