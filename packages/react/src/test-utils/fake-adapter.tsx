import { defineReactUIAdapter, type ReactUIAdapter, type WidgetBinding } from "../index.js";
import type { ReactNode } from "react";

export interface RecordingAdapter extends ReactUIAdapter {
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
      return (
        <input
          data-widget={name}
          data-view={input.view.id}
          data-item={input.scope.binding.itemId ?? ""}
          id={input.ids.control}
          value={input.value === undefined || input.value === null ? "" : String(input.value)}
          disabled={input.fieldSnapshot.disabled}
          readOnly={input.fieldSnapshot.readonly}
          aria-labelledby={input.ids.label}
          aria-invalid={input.presentableErrors.length > 0}
          aria-required={input.fieldSnapshot.required}
          onFocus={() => input.actions.focus()}
          onBlur={() => input.actions.blur()}
          onChange={(event) => {
            const decoded = identityCodec().decode(event.currentTarget.value);
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
          }}
        />
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
  const adapter = defineReactUIAdapter({
    id,
    protocol: { min: { major: 1, minor: 0 } },
    form: {
      render(input) {
        return (
          <form
            id={input.ids.form}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              input.submit();
            }}
          >
            {input.content}
          </form>
        );
      },
    },
    fieldChrome: {
      render(input) {
        return (
          <div data-chrome={input.view.id}>
            <label id={input.ids.label}>{input.field.display?.label ?? input.field.path}</label>
            {input.control}
            {input.presentableErrors.map((error, index) => (
              <p key={error.code} id={input.ids.errors[index]} role="alert">
                {error.message ?? error.code}
              </p>
            ))}
          </div>
        );
      },
    },
    widgets,
    layouts: {
      object: {
        render(input) {
          return <section data-layout="object">{input.children as ReactNode}</section>;
        },
      },
      array: {
        render(input) {
          return <section data-layout="array">{input.children as ReactNode}</section>;
        },
      },
      group: {
        collapsible: true,
        tabs: ["basic", "advanced"],
        render(input) {
          return (
            <section data-layout="group" data-collapsed={String(input.viewSnapshot.collapsed)}>
              {input.children as ReactNode}
            </section>
          );
        },
      },
      layout: {
        render(input) {
          return <section data-layout="grid">{input.children as ReactNode}</section>;
        },
      },
    },
  });
  return Object.assign(adapter, { writes, nativeEvents, widgetRenders });
}
