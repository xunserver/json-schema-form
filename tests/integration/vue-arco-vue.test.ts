/** @vitest-environment jsdom */
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { FormRenderer } from "@xunserver-jsf/vue";
import { arcoVueAdapter } from "@xunserver-jsf/arco-vue";
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";

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

describe("vue + arco-vue integration", () => {
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
