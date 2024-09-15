/** @vitest-environment jsdom */
import { getRuntimeSnapshot, subscribeRuntime, valueSelector } from "@form/core/runtime";
import { describe, expect, test } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { FormRenderer, useRuntimeSelector } from "../index.js";
import { createRecordingAdapter } from "../test-utils/fake-adapter.js";
import { createArrayForm, createPersonForm } from "../test-utils/forms.js";
import { useRendererContext } from "../context/renderer-context.js";
import { compileForm, createForm, defineForm } from "@form/core";

describe("renderer context", () => {
  test("sibling commits do not replace context identity", async () => {
    const form = createPersonForm();
    const seen: object[] = [];
    const Probe = defineComponent({
      name: "ContextProbe",
      setup() {
        const ctx = useRendererContext();
        seen.push(ctx);
        return () => h("span", { "data-probe": "context" }, ctx.adapter.id);
      },
    });
    const base = createRecordingAdapter();
    const adapter = {
      ...base,
      form: {
        render(input: { readonly content: unknown; readonly ids: { readonly form: string }; readonly submit: () => void }) {
          return h("form", { id: input.ids.form }, [input.content as never, h(Probe)]);
        },
      },
    };
    const wrapper = mount(FormRenderer, { props: { form, adapter } });
    await nextTick();
    expect(seen).toHaveLength(1);
    const first = seen[0];
    form.setValue("age", 40);
    await nextTick();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(first);
    wrapper.unmount();
  });
});

describe("runtime selector bridge", () => {
  test("Object.is keeps the same snapshot and replaces listeners when the selector changes", async () => {
    const form = createPersonForm();
    let evaluations = 0;
    const selector = valueSelector("name");
    const original = getRuntimeSnapshot(form, selector);
    const wrapper = mount(
      defineComponent({
        setup() {
          const value = useRuntimeSelector(form, selector);
          return () => h("span", String(value.value));
        },
      }),
    );
    await nextTick();
    form.setValue("age", 1);
    await nextTick();
    expect(getRuntimeSnapshot(form, selector)).toBe(original);
    form.setValue("name", "Grace");
    await nextTick();
    expect(wrapper.text()).toBe("Grace");
    wrapper.unmount();
    const after: string[] = [];
    subscribeRuntime(form, selector, (value) => {
      after.push(String(value));
    });
    form.setValue("name", "Linus");
    expect(after).toEqual(["Linus"]);
    void evaluations;
  });

  test("sibling field subscriptions do not recompute unrelated consumers", async () => {
    const form = createPersonForm();
    const adapter = createRecordingAdapter();
    const wrapper = mount(FormRenderer, { props: { form, adapter } });
    await nextTick();
    adapter.widgetRenders.length = 0;
    form.setValue("name", "Grace");
    await nextTick();
    expect(adapter.widgetRenders.filter((name) => name === "text").length).toBeGreaterThan(0);
    expect(adapter.widgetRenders.filter((name) => name === "number")).toEqual([]);
    wrapper.unmount();
  });
});

describe("form renderer traversal", () => {
  test("renders the final ViewTree without reading schema or writing values", async () => {
    const form = createPersonForm();
    const adapter = createRecordingAdapter();
    const wrapper = mount(FormRenderer, { props: { form, adapter } });
    await nextTick();
    expect(wrapper.get("[data-widget=text]").attributes("value")).toBe("Ada");
    expect(JSON.stringify(form.model.ui.viewTree)).toContain("name");
    expect(adapter.writes).toEqual([]);
    wrapper.unmount();
  });

  test("duplicate FieldViews share field truth and keep independent view ids", async () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties: { name: { type: "string" } } },
          uiSchema: {
            layout: {
              type: "layout",
              children: [
                { type: "group", children: [{ type: "field", path: "name" }] },
                { type: "group", children: [{ type: "field", path: "name" }] },
              ],
            },
          },
        }),
      ).model,
      { initialValues: { name: "Ada" } },
    );
    const wrapper = mount(FormRenderer, { props: { form, adapter: createRecordingAdapter() } });
    await nextTick();
    const inputs = wrapper.findAll("[data-widget=text]");
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.attributes("data-view")).not.toBe(inputs[1]?.attributes("data-view"));
    form.setValue("name", "Grace");
    await nextTick();
    expect(inputs[0]?.attributes("value")).toBe("Grace");
    expect(inputs[1]?.attributes("value")).toBe("Grace");
    wrapper.unmount();
  });

  test("hidden fields unmount without clearing core state", async () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties: { kind: { type: "string" }, secret: { type: "string" } } },
          rules: [
            {
              kind: "state",
              target: "secret",
              action: { visible: { eq: [{ field: "kind" }, "show"] } },
            },
          ],
        }),
      ).model,
      { initialValues: { kind: "show", secret: "hidden-value" } },
    );
    form.touch("secret");
    const wrapper = mount(FormRenderer, { props: { form, adapter: createRecordingAdapter() } });
    await nextTick();
    expect(wrapper.find("[data-widget=text]").exists()).toBe(true);
    form.setValue("kind", "hide");
    await nextTick();
    expect(form.getField("secret").getState()).toMatchObject({
      value: "hidden-value",
      touched: true,
      visible: false,
    });
    expect(wrapper.findAll("[data-widget=text]").length).toBe(1);
    form.setValue("kind", "show");
    await nextTick();
    expect(wrapper.findAll("[data-widget=text]").some((item) => item.attributes("value") === "hidden-value")).toBe(true);
    wrapper.unmount();
  });

  test("array move keeps ArrayItemId identity", async () => {
    const form = createArrayForm();
    const firstId = form.array("products").items()[0]?.id;
    const wrapper = mount(FormRenderer, { props: { form, adapter: createRecordingAdapter() } });
    await nextTick();
    const before = wrapper.findAll("section [data-widget=text]").map((item) => item.attributes("data-item"));
    form.array("products").move(0, 2);
    await nextTick();
    expect(form.array("products").items()[2]?.id).toBe(firstId);
    const after = wrapper.findAll("section [data-widget=text]").map((item) => item.attributes("data-item"));
    expect(after).not.toEqual(before);
    expect(after.some((id) => id === before[0])).toBe(true);
    wrapper.unmount();
  });

  test("failed decode does not create a transaction", async () => {
    const form = createPersonForm();
    const adapter = createRecordingAdapter();
    const original = adapter.widgets.text!;
    const originalRender = original.render;
    adapter.widgets.text = {
      ...original,
      render(input) {
        return originalRender({
          ...input,
          actions: {
            ...input.actions,
            setValue() {
              const decoded = original.codec.decode("__invalid__");
              if (!decoded.ok) {
                input.reportDiagnostic({
                  code: decoded.code,
                  severity: "error",
                  message: decoded.message,
                  source: "adapter",
                  pluginId: "fake",
                });
                return;
              }
              input.actions.setValue(decoded.value);
            },
          },
        });
      },
    };
    const version = form.getState().version;
    const wrapper = mount(FormRenderer, { props: { form, adapter } });
    await nextTick();
    wrapper.get("[data-widget=text]").element.dispatchEvent(new Event("change"));
    expect(form.getState().version).toBe(version);
    wrapper.unmount();
  });

  test("field:false is not reconstructed", async () => {
    const form = createPersonForm({ name: "Ada", age: 1 }, { fields: { secret: { field: false } } });
    const wrapper = mount(FormRenderer, { props: { form, adapter: createRecordingAdapter() } });
    await nextTick();
    expect(form.model.ui.fields.has("secret")).toBe(false);
    expect(wrapper.html()).not.toContain("secret");
    wrapper.unmount();
  });
});
