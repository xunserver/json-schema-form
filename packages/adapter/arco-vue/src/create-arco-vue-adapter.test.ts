/** @vitest-environment jsdom */
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import { createFormEnvironment, definePlugin, defineWidget } from "@xunserver-jsf/core/extension";
import { createVueRendererEnvironment, FormRenderer } from "@xunserver-jsf/vue";
import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { h, nextTick } from "vue";
import { ARCO_VUE_ADAPTER_ID, arcoVueAdapter, createArcoVueAdapter, extendArcoVueAdapter } from "./index.js";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as typeof ResizeObserver;
}

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

  test("uses vertical form layout and official FormItem label/extra slots", async () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties: { name: { type: "string" } } },
          uiSchema: { fields: { name: { display: { label: "姓名", help: "string + text" } } } },
        }),
      ).model,
      { initialValues: { name: "Ada" } },
    );
    const wrapper = mount(FormRenderer, {
      props: { form, adapter: arcoVueAdapter },
    });
    await nextTick();
    expect(wrapper.find("form.arco-form-layout-vertical").exists()).toBe(true);
    expect(wrapper.find(".arco-form-item-layout-vertical").exists()).toBe(true);
    const labeled = wrapper.find('[aria-labelledby*="field:name"]');
    expect(labeled.exists()).toBe(true);
    const nameItem = labeled.element.closest(".arco-form-item");
    expect(nameItem).not.toBeNull();
    const nameLabel = nameItem?.querySelector(".arco-form-item-label");
    expect(nameLabel?.textContent).toContain("姓名");
    expect(nameLabel?.querySelector("span")?.id).toBe(labeled.attributes("aria-labelledby"));
    const extra = nameItem?.querySelector(".arco-form-item-extra");
    expect(extra?.textContent).toBe("string + text");
    expect(nameItem?.querySelector(".arco-form-item-content")?.textContent).not.toContain("姓名");
    expect(nameItem?.querySelector(".arco-form-item-content")?.textContent).not.toContain("string + text");
    wrapper.unmount();
  });

  test("presentable required errors render in FormItem help", async () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
          uiSchema: { fields: { name: { display: { label: "姓名" } } } },
        }),
      ).model,
      { initialValues: { name: "Ada" } },
    );
    const wrapper = mount(FormRenderer, {
      props: { form, adapter: arcoVueAdapter },
    });
    await nextTick();
    form.applyErrors([{ code: "required", instancePath: "name", message: "必须填写姓名" }]);
    form.touch("name");
    await nextTick();
    const alert = wrapper.find("[role=alert]");
    expect(alert.text()).toBe("必须填写姓名");
    expect(wrapper.find(".arco-form-item-error").exists()).toBe(true);
    expect(wrapper.find(".arco-form-item-message").exists()).toBe(true);
    expect(wrapper.find(".arco-form-item-content [role=alert]").exists()).toBe(false);
    wrapper.unmount();
  });
});
