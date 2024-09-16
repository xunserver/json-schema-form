import { FULL_WIDGET_INTERACTION, type WidgetCapabilities } from "@form/core/extension";
import {
  freezeAdapterDiagnostic,
  RENDERER_DIAGNOSTIC_CODES,
  type CodecResult,
  type ValueCodec,
  type WidgetBinding,
  type WidgetRenderInput,
} from "@form/react";
import type { ShadcnAdapterComponents } from "../components.js";
import { mapShadcnProps } from "./mapper.js";
import { booleanCodec } from "./codecs.js";

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
        pluginId: "shadcn",
        modelPath: input.field.path,
        metadata: {
          adapterId: "shadcn",
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
  components: ShadcnAdapterComponents,
  codec: ValueCodec,
  type?: string,
): WidgetBinding {
  const Input = components.Input;
  return {
    codec,
    mapProps: mapShadcnProps,
    capabilities: EDITABLE_CAPABILITIES,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const encoded = codec.encode(input.value);
      const described = describedBy(input);
      return (
        <Input
          {...input.nativeProps}
          {...(type === undefined ? {} : { type })}
          id={input.ids.control}
          value={typeof encoded === "string" || typeof encoded === "number" ? encoded : ""}
          disabled={input.fieldSnapshot.disabled}
          readOnly={input.fieldSnapshot.readonly}
          aria-labelledby={input.ids.label}
          aria-invalid={input.presentableErrors.length > 0}
          aria-required={input.fieldSnapshot.required}
          {...(described === undefined ? {} : { "aria-describedby": described })}
          onChange={(event) => {
            applyCodecChange(input, codec, event.target.value);
          }}
          onFocus={() => input.actions.focus()}
          onBlur={() => input.actions.blur()}
        />
      );
    },
  };
}

export function textareaBinding(components: ShadcnAdapterComponents, codec: ValueCodec): WidgetBinding {
  const Textarea = components.Textarea;
  return {
    codec,
    mapProps: mapShadcnProps,
    capabilities: EDITABLE_CAPABILITIES,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const encoded = codec.encode(input.value);
      const described = describedBy(input);
      return (
        <Textarea
          {...input.nativeProps}
          id={input.ids.control}
          value={typeof encoded === "string" ? encoded : ""}
          rows={3}
          disabled={input.fieldSnapshot.disabled}
          readOnly={input.fieldSnapshot.readonly}
          aria-labelledby={input.ids.label}
          aria-invalid={input.presentableErrors.length > 0}
          aria-required={input.fieldSnapshot.required}
          {...(described === undefined ? {} : { "aria-describedby": described })}
          onChange={(event) => {
            applyCodecChange(input, codec, event.target.value);
          }}
          onFocus={() => input.actions.focus()}
          onBlur={() => input.actions.blur()}
        />
      );
    },
  };
}

export function checkboxBinding(components: ShadcnAdapterComponents): WidgetBinding {
  const Checkbox = components.Checkbox;
  return {
    codec: booleanCodec,
    mapProps: mapShadcnProps,
    capabilities: { disabled: true, inlineLabel: true, readonly: true },
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
          onCheckedChange={(checked) => {
            applyCodecChange(input, booleanCodec, checked);
          }}
          onFocus={() => input.actions.focus()}
          onBlur={() => input.actions.blur()}
        />
      );
    },
  };
}

export function switchBinding(components: ShadcnAdapterComponents): WidgetBinding {
  const Switch = components.Switch;
  return {
    codec: booleanCodec,
    mapProps: mapShadcnProps,
    capabilities: { disabled: true, inlineLabel: true, readonly: true },
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
          onCheckedChange={(checked) => {
            applyCodecChange(input, booleanCodec, checked);
          }}
        />
      );
    },
  };
}
