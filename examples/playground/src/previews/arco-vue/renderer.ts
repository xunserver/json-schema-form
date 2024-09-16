import { createVueRendererEnvironment } from "@xunserver-jsf/vue";
import { createArcoVueAdapter, extendArcoVueAdapter } from "@xunserver-jsf/arco-vue";
import { h } from "vue";
import type { WidgetRenderInput } from "@xunserver-jsf/vue";

export function createDemoRendererEnvironment() {
  return createVueRendererEnvironment({
    adapters: [createArcoVueAdapter()],
    contributions: [
      extendArcoVueAdapter({
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
              return h("input", {
                id: input.ids.control,
                value: typeof input.value === "string" ? input.value : "",
                "aria-labelledby": input.ids.label,
                onFocus: () => input.actions.focus(),
                onBlur: () => input.actions.blur(),
                onChange: (event: Event) => input.actions.setValue((event.target as HTMLInputElement).value),
              });
            },
          },
        },
      }),
    ],
  });
}
