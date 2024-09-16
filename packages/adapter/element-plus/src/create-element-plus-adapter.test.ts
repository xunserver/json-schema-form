import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import { createFormEnvironment, definePlugin, defineWidget } from "@xunserver-jsf/core/extension";
import { createVueRendererEnvironment } from "@xunserver-jsf/vue";
import { describe, expect, test } from "vitest";
import { ELEMENT_PLUS_ADAPTER_ID, createElementPlusAdapter, elementPlusAdapter, extendElementPlusAdapter } from "./index.js";
import { h } from "vue";

describe("element-plus adapter skeleton", () => {
  test("registers nine widgets and four layout roles uniquely", () => {
    expect(elementPlusAdapter.id).toBe(ELEMENT_PLUS_ADAPTER_ID);
    const environment = createVueRendererEnvironment({ adapters: [elementPlusAdapter] });
    const adapter = environment.getAdapter(ELEMENT_PLUS_ADAPTER_ID)!;
    for (const key of ["text", "textarea", "number", "select", "multi-select", "checkbox", "switch", "date", "datetime"]) {
      expect(adapter.widgets.has(key), key).toBe(true);
    }
    for (const key of ["object", "array", "group", "layout"]) {
      expect(adapter.layouts.has(key), key).toBe(true);
    }
    expect(adapter.widgets.inspect("text")?.owner).toBe("element-plus");
  });

  test("custom extension uses explicit provenance and semantic-only mutation", () => {
    const widget = defineWidget({
      name: "company.currency",
      valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
      interaction: { setValue: true, touch: true, focus: true, blur: true },
    });
    const environmentCore = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "company",
          dependsOn: ["core"],
          contributes: { widgets: { "company.currency": widget } },
        }),
      ],
    });
    const { model } = compileForm(
      defineForm({
        schema: { type: "object", properties: { currency: { type: "string" } } },
        uiSchema: { fields: { currency: { widget: "company.currency" } } },
      }),
      { environment: environmentCore },
    );
    const form = createForm(model, { environment: environmentCore, initialValues: { currency: "USD" } });
    const contribution = extendElementPlusAdapter({
      owner: "app",
      widgets: {
        "company.currency": {
          codec: {
            encode: (value) => value,
            decode: (native) => (typeof native === "string" ? { ok: true, value: native } : { ok: false, code: "x", message: "x" }),
          },
          interaction: { setValue: true, touch: true, focus: true, blur: true },
          custom: true,
          render(input) {
            expect("form" in input).toBe(false);
            expect("store" in input).toBe(false);
            return h("input", {
              value: input.value,
              onChange: (event: Event) => input.actions.setValue((event.target as HTMLInputElement).value),
            });
          },
        },
      },
    });
    const rendererEnv = createVueRendererEnvironment({
      adapters: [createElementPlusAdapter()],
      contributions: [contribution],
    });
    expect(rendererEnv.getAdapter("element-plus")?.widgets.inspect("company.currency")?.owner).toBe("app");
    expect(form.getValue("currency")).toBe("USD");
  });
});
