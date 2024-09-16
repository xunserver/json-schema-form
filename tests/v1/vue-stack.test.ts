/** @vitest-environment jsdom */
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { FormRenderer } from "@form/vue";
import { applySemanticSteps, compileV1, observeForm } from "../fixtures/v1/index.js";
import { createDemoRendererEnvironment } from "../../examples/vue-element-plus/src/renderer.ts";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as typeof ResizeObserver;
}

describe("v1 vue stack", () => {
  test("V1-CROSS-STACK-VUE renders the shared fixture through Element Plus", async () => {
    const { form } = compileV1("explicit");
    const wrapper = mount(FormRenderer, {
      props: { form, environment: createDemoRendererEnvironment(), adapterId: "element-plus" },
    });
    await nextTick();
    expect(wrapper.html()).toContain("Name");
    expect(wrapper.html()).toContain("Currency");
    const previousIds = form.array("products").items().map((item) => item.id);
    const submitted = await applySemanticSteps(form);
    await nextTick();
    const observation = observeForm(form, { previousIds, submitted });
    expect(observation.values).toMatchObject({ name: "Grace" });
    expect(wrapper.html()).toContain("Name");
    wrapper.unmount();
  });
});
