import { createReactRendererEnvironment } from "@form/react";
import { createAntdAdapter, extendAntdAdapter } from "@form/antd";
import type { WidgetRenderInput } from "@form/react";

function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

export function createDemoRendererEnvironment() {
  installMatchMedia();
  return createReactRendererEnvironment({
    adapters: [createAntdAdapter()],
    contributions: [
      extendAntdAdapter({
        owner: "app",
        widgets: {
          "company.currency": {
            codec: {
              encode: (value) => (typeof value === "string" ? value : ""),
              decode: (native) =>
                typeof native === "string"
                  ? { ok: true, value: native }
                  : { ok: false, code: "adapter.codec-failure", message: "Expected string" },
            },
            interaction: { setValue: true, touch: true, focus: true, blur: true },
            custom: true,
            render(input: WidgetRenderInput) {
              return (
                <input
                  id={input.ids.control}
                  value={typeof input.value === "string" ? input.value : ""}
                  aria-labelledby={input.ids.label}
                  onFocus={() => input.actions.focus()}
                  onBlur={() => input.actions.blur()}
                  onChange={(event) => input.actions.setValue(event.currentTarget.value)}
                />
              );
            },
          },
        },
      }),
    ],
  });
}
