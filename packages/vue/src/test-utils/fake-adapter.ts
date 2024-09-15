import { defineVueUIAdapter, type VueUIAdapter, type WidgetBinding } from "../index.js";
import { h } from "vue";

export interface RecordingAdapter extends VueUIAdapter {
  readonly writes: unknown[];
  readonly nativeEvents: unknown[];
  readonly widgetRenders: string[];
}

function identityCodec(): WidgetBinding["codec"] {
  return {
    encode: (value) => value,
    decode: (native) => {
      if (native === "__invalid__") {
        return { ok: false, code: "adapter.codec-failure", message: "invalid" };
      }
      return { ok: true, value: native as never };
    },
  };
}

function widget(name: string, extras?: Partial<WidgetBinding>): WidgetBinding {
  return {
    codec: identityCodec(),
    mapProps: () => Object.freeze({}),
    capabilities: { readonly: true, disabled: true, clearable: true, multiple: name === "multi-select" },
    interaction: { setValue: true, touch: true, focus: true, blur: true },
    render(input) {
      return h(
        "input",
        {
          "data-widget": name,
          "data-view": input.view.id,
          "data-item": input.scope.binding.itemId ?? "",
          id: input.ids.control,
          value: input.value === undefined || input.value === null ? "" : String(input.value),
          disabled: input.fieldSnapshot.disabled,
          readOnly: input.fieldSnapshot.readonly,
          "aria-labelledby": input.ids.label,
          "aria-invalid": input.presentableErrors.length > 0,
          "aria-required": input.fieldSnapshot.required,
          onFocus: () => input.actions.focus(),
          onBlur: () => input.actions.blur(),
          onChange: (event: Event) => {
            const target = event.target as HTMLInputElement;
            const decoded = identityCodec().decode(target.value);
            if (decoded.ok) {
              input.actions.setValue(decoded.value);
            } else {
              input.reportDiagnostic({
                code: decoded.code,
                severity: "error",
                message: decoded.message,
                source: "adapter",
                pluginId: "fake",
              });
            }
          },
        },
      );
    },
    ...extras,
  };
}

const builtin = [
  "text",
  "textarea",
  "number",
  "select",
  "multi-select",
  "checkbox",
  "switch",
  "date",
  "datetime",
] as const;

export function createRecordingAdapter(id = "fake"): RecordingAdapter {
  const writes: unknown[] = [];
  const nativeEvents: unknown[] = [];
  const widgetRenders: string[] = [];
  const widgets: Record<string, WidgetBinding> = {};
  for (const name of builtin) {
    const base = widget(name);
    widgets[name] = {
      ...base,
      render(input) {
        widgetRenders.push(name);
        const originalSetValue = input.actions.setValue;
        return base.render({
          ...input,
          actions: {
            ...input.actions,
            setValue(value) {
              writes.push(value);
              originalSetValue(value);
            },
          },
        });
      },
    };
  }
  const adapter = defineVueUIAdapter({
    id,
    protocol: { min: { major: 1, minor: 0 } },
    form: {
      render(input) {
        return h("form", { id: input.ids.form, onSubmit: (event: Event) => {
          event.preventDefault();
          input.submit();
        } }, input.content);
      },
    },
    fieldChrome: {
      render(input) {
        return h("div", { "data-chrome": input.view.id }, [
          h("label", { id: input.ids.label }, input.field.display?.label ?? input.field.path),
          input.control,
          ...input.presentableErrors.map((error, index) =>
            h("p", { id: input.ids.errors[index], role: "alert" }, error.message ?? error.code),
          ),
        ]);
      },
    },
    widgets,
    layouts: {
      object: {
        render(input) {
          return h("section", { "data-layout": "object" }, input.children);
        },
      },
      array: {
        render(input) {
          return h("section", { "data-layout": "array" }, input.children);
        },
      },
      group: {
        collapsible: true,
        tabs: ["basic", "advanced"],
        render(input) {
          return h("section", { "data-layout": "group", "data-collapsed": String(input.viewSnapshot.collapsed) }, input.children);
        },
      },
      layout: {
        render(input) {
          return h("section", { "data-layout": "grid" }, input.children);
        },
      },
    },
  });
  return Object.assign(adapter, { writes, nativeEvents, widgetRenders });
}
