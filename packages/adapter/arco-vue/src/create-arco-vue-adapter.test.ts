import { compileForm, createForm, defineForm } from "@form/core";
import { createFormEnvironment, definePlugin, defineWidget } from "@form/core/extension";
import { createVueRendererEnvironment } from "@form/vue";
import { describe, expect, test } from "vitest";
import { h } from "vue";
import { ARCO_VUE_ADAPTER_ID, arcoVueAdapter, createArcoVueAdapter, extendArcoVueAdapter } from "./index.js";

describe("arco-vue adapter skeleton", () => {
  test("registers nine widgets and four layout roles uniquely", () => {
    expect(arcoVueAdapter.id).toBe(ARCO_VUE_ADAPTER_ID);
    const environment = createVueRendererEnvironment({ adapters: [arcoVueAdapter] });
    const adapter = environment.getAdapter(ARCO_VUE_ADAPTER_ID)!;
    for (const key of ["text", "textarea", "number", "select", "multi-select", "checkbox", "switch", "date", "datetime"]) {
      expect(adapter.widgets.has(key), key).toBe(true);
    }
    for (const key of ["object", "array", "group", "layout"]) {
      expect(adapter.layouts.has(key), key).toBe(true);
    }
    expect(adapter.widgets.inspect("text")?.owner).toBe("arco-vue");
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
    const contribution = extendArcoVueAdapter({
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
      adapters: [createArcoVueAdapter()],
      contributions: [contribution],
    });
    expect(rendererEnv.getAdapter("arco-vue")?.widgets.inspect("company.currency")?.owner).toBe("app");
    expect(form.getValue("currency")).toBe("USD");
  });
});
