import type { Diagnostic } from "@xunserver-jsf/core";
import { RENDERER_DIAGNOSTIC_CODES, RendererAdapterError, type WidgetRenderInput } from "@xunserver-jsf/vue";

export const ELEMENT_PLUS_NAMESPACE = "element-plus";

export const PROTECTED_NATIVE_KEYS = Object.freeze(
  new Set([
    "value",
    "modelValue",
    "defaultValue",
    "checked",
    "defaultChecked",
    "disabled",
    "readonly",
    "readOnly",
    "required",
    "error",
    "errors",
    "status",
    "validateStatus",
    "validateMessage",
    "showMessage",
    "id",
    "for",
    "name",
    "prop",
    "model",
    "rules",
    "validate",
    "resetFields",
    "clearValidate",
    "onUpdate:modelValue",
    "onUpdate:value",
    "onChange",
    "onInput",
    "onFocus",
    "onBlur",
    "onchange",
    "oninput",
    "onfocus",
    "onblur",
    "aria-labelledby",
    "aria-describedby",
    "aria-invalid",
    "aria-required",
    "aria-disabled",
    "aria-readonly",
  ]),
);

export function mapElementPlusProps(input: WidgetRenderInput): Readonly<Record<string, unknown>> {
  const merged: Record<string, unknown> = {};
  collectLayer(merged, input.field.props, input, "props");
  collectLayer(merged, input.field.native?.[ELEMENT_PLUS_NAMESPACE], input, "native");
  return Object.freeze(merged);
}

function collectLayer(
  target: Record<string, unknown>,
  source: Readonly<Record<string, unknown>> | undefined,
  input: WidgetRenderInput,
  layer: string,
): void {
  if (source === undefined) {
    return;
  }
  for (const key of Object.keys(source).sort()) {
    if (key.startsWith("aria-") || PROTECTED_NATIVE_KEYS.has(key)) {
      throw protectedKeyError(input, key, layer);
    }
    if (key === "onClick" || key.startsWith("onUpdate:") || /^on[A-Z]/.test(key)) {
      throw protectedKeyError(input, key, layer);
    }
    target[key] = source[key];
  }
}

function protectedKeyError(input: WidgetRenderInput, key: string, layer: string): RendererAdapterError {
  const diagnostic: Diagnostic = {
    code: RENDERER_DIAGNOSTIC_CODES.MAPPER_PROTECTED_KEY,
    severity: "error",
    message: `Protected native key "${key}" cannot be set from ${layer}`,
    source: "adapter",
    pluginId: ELEMENT_PLUS_NAMESPACE,
    modelPath: input.field.path,
    metadata: {
      adapterId: ELEMENT_PLUS_NAMESPACE,
      key: input.field.widget,
      protectedKey: key,
      layer,
      viewId: input.view.id,
    },
  };
  return new RendererAdapterError(diagnostic);
}
