import { FULL_WIDGET_INTERACTION, type WidgetCapabilities } from "@xunserver-jsf/core/extension";
import {
  freezeAdapterDiagnostic,
  RENDERER_DIAGNOSTIC_CODES,
  type CodecResult,
  type ValueCodec,
  type WidgetBinding,
  type WidgetRenderInput,
} from "@xunserver-jsf/vue";
import { h, type Component } from "vue";
import { mapElementPlusProps } from "./mapper.js";

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
        pluginId: "element-plus",
        modelPath: input.field.path,
        metadata: {
          adapterId: "element-plus",
          key: input.field.widget,
          viewId: input.view.id,
        },
      }),
    );
    return;
  }
  input.actions.setValue(decoded.value);
}

export function controlledWidget(
  component: Component,
  codec: ValueCodec,
  extra?: (input: WidgetRenderInput) => Record<string, unknown>,
  capabilities: WidgetCapabilities = EDITABLE_CAPABILITIES,
): WidgetBinding {
  return {
    codec,
    mapProps: mapElementPlusProps,
    capabilities,
    interaction: FULL_WIDGET_INTERACTION,
    render(input) {
      const encoded = codec.encode(input.value);
      const extraProps = extra === undefined ? {} : extra(input);
      const described = describedBy(input);
      const props: Record<string, unknown> = {
        ...input.nativeProps,
        ...extraProps,
        id: input.ids.control,
        modelValue: encoded,
        disabled: input.fieldSnapshot.disabled || input.fieldSnapshot.readonly,
        readonly: input.fieldSnapshot.readonly,
        "aria-labelledby": input.ids.label,
        "aria-invalid": input.presentableErrors.length > 0,
        "aria-required": input.fieldSnapshot.required,
        "onUpdate:modelValue": (value: unknown) => applyCodecChange(input, codec, value),
        onFocus: () => input.actions.focus(),
        onBlur: () => input.actions.blur(),
      };
      if (described !== undefined) {
        props["aria-describedby"] = described;
      }
      return h(component, props);
    },
  };
}

export function describedBy(input: WidgetRenderInput): string | undefined {
  const ids = [
    input.field.display?.help === undefined ? undefined : input.ids.help,
    ...input.ids.errors,
  ].filter((id): id is string => id !== undefined);
  return ids.length === 0 ? undefined : ids.join(" ");
}
