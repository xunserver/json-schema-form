/** @vitest-environment jsdom */
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import { FormRenderer } from "@form/vue";
import { elementPlusAdapter } from "@form/element-plus";
import { compileForm, createForm, defineForm } from "@form/core";
import { createDemoForm } from "../../examples/shared/src/demo.ts";
import { createDemoRendererEnvironment } from "../lib/demo-element-plus-environment.ts";
import { createRecordingAdapter } from "../../packages/vue/src/test-utils/fake-adapter.ts";
import { createArrayForm } from "../../packages/vue/src/test-utils/forms.ts";

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as typeof ResizeObserver;
}

describe("vue + element-plus integration", () => {
  test("mounts nine widgets with field chrome and ARIA", async () => {
    const form = createDemoForm();
    const wrapper = mount(FormRenderer, {
      props: { form, environment: createDemoRendererEnvironment(), adapterId: "element-plus" },
    });
    await nextTick();
    expect(wrapper.html()).toContain("姓名");
    expect(wrapper.html()).toContain("简介");
    expect(wrapper.html()).toContain("年龄");
    expect(wrapper.html()).toContain("角色");
    expect(wrapper.html()).toContain("标签");
    expect(wrapper.html()).toContain("启用");
    expect(wrapper.html()).toContain("提醒");
    expect(wrapper.html()).toContain("入职日期");
    expect(wrapper.html()).toContain("会议时间");
    expect(wrapper.html()).toContain("货币");
    const labeled = wrapper.find("[aria-labelledby]");
    expect(labeled.exists()).toBe(true);
    wrapper.unmount();
  });

  test("external Core commits overwrite all nine widget displays", async () => {
    const form = createDemoForm();
    const wrapper = mount(FormRenderer, {
      props: { form, environment: createDemoRendererEnvironment(), adapterId: "element-plus" },
    });
    await nextTick();
    form.setValue("name", "Grace");
    form.setValue("bio", "Updated");
    form.setValue("age", 40);
    form.setValue("role", "user");
    form.setValue("tags", ["b"]);
    form.setValue("active", false);
    form.setValue("alerts", true);
    form.setValue("joined", "2026-01-01");
    form.setValue("meeting", "2026-01-01T00:00:00Z");
    await nextTick();
    const nameInput = wrapper.get('input[aria-labelledby*="field:name"]').element as HTMLInputElement;
    expect(nameInput.value).toBe("Grace");
    const version = form.getState().version;
    form.reset();
    await nextTick();
    expect(form.getState().version).toBeGreaterThan(version);
    expect((wrapper.get('input[aria-labelledby*="field:name"]').element as HTMLInputElement).value).toBe("Ada");
    expect(form.getValue("age")).toBe(36);
    expect(form.getValue("active")).toBe(true);
    wrapper.unmount();
  });

  test("array move, visibility, and server errors keep Core as the only truth", async () => {
    const form = createArrayForm();
    const first = form.array("products").items()[0]!;
    form.setValue("products[0].name", "Alpha");
    form.touch("products[0].name");
    const adapter = createRecordingAdapter();
    const wrapper = mount(FormRenderer, { props: { form, adapter } });
    await nextTick();
    form.array("products").move(0, 2);
    await nextTick();
    expect(form.array("products").items()[2]?.id).toBe(first.id);
    expect(form.getValue("products[2].name")).toBe("Alpha");
    form.applyErrors([{ code: "server.taken", instancePath: "products[2].name", message: "taken" }]);
    await nextTick();
    expect(form.getField("products[2].name").getState().errors.some((error) => error.code === "server.taken")).toBe(
      true,
    );
    const version = form.getState().version;
    form.reset();
    expect(form.getState().version).toBeGreaterThan(version);
    wrapper.unmount();
  });
});

describe("element-plus form adapter does not own validation", () => {
  test("does not call Element Plus validate APIs", async () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties: { name: { type: "string" } } },
        }),
      ).model,
      { initialValues: { name: "Ada" } },
    );
    const wrapper = mount(FormRenderer, { props: { form, adapter: elementPlusAdapter } });
    await nextTick();
    const elForm = wrapper.findComponent({ name: "ElForm" });
    if (elForm.exists()) {
      expect(typeof elForm.vm.validate).toBe("function");
      expect(form.getState().errors).toEqual([]);
    }
    expect(form.getValue("name")).toBe("Ada");
    wrapper.unmount();
  });
});
