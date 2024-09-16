import { FULL_WIDGET_INTERACTION, type WidgetCapabilities } from "@xunserver-jsf/core/extension";
import {
  freezeAdapterDiagnostic,
  RENDERER_DIAGNOSTIC_CODES,
  type CodecResult,
  type ValueCodec,
  type WidgetBinding,
  type WidgetRenderInput,
} from "@xunserver-jsf/react";
import { mapArcoReactProps } from "./mapper.js";
import type { CSSProperties, FocusEvent, InputHTMLAttributes, ReactElement } from "react";
import { Checkbox, Input, Switch } from "@arco-design/web-react";

export function fullWidthStyle(nativeProps: Readonly<Record<string, unknown>>): CSSProperties {
  const extra = nativeProps.style;
  if (extra !== null && typeof extra === "object" && !Array.isArray(extra)) {
    return { width: "100%", ...(extra as CSSProperties) };
  }
  return { width: "100%" };
}

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
        pluginId: "arco-react",
        modelPath: input.field.path,
        metadata: {
          adapterId: "arco-react",
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

export function arcoInputBinding(
  codec: ValueCodec,
  extra?: (input: WidgetRenderInput) => Record<string, unknown>,
  Component: typeof Input | typeof Input.TextArea = Input,
): WidgetBinding {
  return {
    codec,
    mapProps: mapArcoReactProps,
    capabilities: EDITABLE_CAPABILITIES,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const encoded = codec.encode(input.value);
      const extraProps = extra === undefined ? {} : extra(input);
      const described = describedBy(input);
      return (
        <Component
          {...input.nativeProps}
          {...extraProps}
          style={fullWidthStyle({ ...input.nativeProps, ...extraProps })}
          id={input.ids.control}
          value={typeof encoded === "string" ? encoded : ""}
          disabled={input.fieldSnapshot.disabled}
          readOnly={input.fieldSnapshot.readonly}
          aria-labelledby={input.ids.label}
          aria-invalid={input.presentableErrors.length > 0}
          aria-required={input.fieldSnapshot.required}
          {...(described === undefined ? {} : { "aria-describedby": described })}
          onChange={(value: string) => {
            applyCodecChange(input, codec, value);
          }}
          onFocus={() => input.actions.focus()}
          onBlur={() => input.actions.blur()}
        />
      ) as ReactElement;
    },
  };
}

export function nativeInputBinding(
  codec: ValueCodec,
  extra?: (input: WidgetRenderInput) => InputHTMLAttributes<HTMLInputElement>,
): WidgetBinding {
  return {
    codec,
    mapProps: mapArcoReactProps,
    capabilities: EDITABLE_CAPABILITIES,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const encoded = codec.encode(input.value);
      const extraProps = extra === undefined ? {} : extra(input);
      const described = describedBy(input);
      return (
        <input
          {...input.nativeProps}
          {...extraProps}
          style={fullWidthStyle({ ...input.nativeProps, ...extraProps })}
          id={input.ids.control}
          value={typeof encoded === "string" ? encoded : ""}
          disabled={input.fieldSnapshot.disabled}
          readOnly={input.fieldSnapshot.readonly}
          aria-labelledby={input.ids.label}
          aria-invalid={input.presentableErrors.length > 0}
          aria-required={input.fieldSnapshot.required}
          {...(described === undefined ? {} : { "aria-describedby": described })}
          onChange={(event) => {
            applyCodecChange(input, codec, event.currentTarget.value);
          }}
          onFocus={() => input.actions.focus()}
          onBlur={() => input.actions.blur()}
        />
      );
    },
  };
}

export function booleanControlBinding(
  Component: typeof Checkbox | typeof Switch,
  capabilities: WidgetCapabilities = { disabled: true, inlineLabel: true, readonly: true },
): WidgetBinding {
  return {
    codec: booleanCodecAlias,
    mapProps: mapArcoReactProps,
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
          aria-labelledby={input.ids.label}
          aria-invalid={input.presentableErrors.length > 0}
          aria-required={input.fieldSnapshot.required}
          {...(described === undefined ? {} : { "aria-describedby": described })}
          onChange={(checked: boolean) => {
            applyCodecChange(input, booleanCodecAlias, checked);
          }}
          onFocus={(event: FocusEvent) => {
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
