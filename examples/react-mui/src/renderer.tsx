import { createReactRendererEnvironment } from "@form/react";
import { createMuiAdapter, extendMuiAdapter } from "@form/mui";
import type { WidgetRenderInput } from "@form/react";

export function createDemoRendererEnvironment() {
  return createReactRendererEnvironment({
    adapters: [createMuiAdapter()],
    contributions: [
      extendMuiAdapter({
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
