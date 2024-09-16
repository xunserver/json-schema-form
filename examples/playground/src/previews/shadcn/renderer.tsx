import { createReactRendererEnvironment } from "@xunserver-jsf/react";
import { createShadcnAdapter, extendShadcnAdapter } from "@xunserver-jsf/shadcn";
import type { WidgetRenderInput } from "@xunserver-jsf/react";
import { previewShadcnComponents } from "./components.js";

export function createDemoRendererEnvironment() {
  return createReactRendererEnvironment({
    adapters: [createShadcnAdapter({ components: previewShadcnComponents })],
    contributions: [
      extendShadcnAdapter({
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
                  className="flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
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
