import { createSelector, subscribeRuntime, valueSelector } from "@form/core/runtime";
import { describe, expect, test } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { FormRenderer, useRuntimeSelector } from "../index.js";
import { createRecordingAdapter } from "../test-utils/fake-adapter.js";
import { createPersonForm } from "../test-utils/forms.js";

describe("SSR snapshot-only path", () => {
  test("does not install runtime listeners or read browser globals", async () => {
    const form = createPersonForm();
    let evaluations = 0;
    const selector = createSelector([valueSelector("name")], (value) => {
      evaluations += 1;
      return value;
    });
    const Probe = defineComponent({
      setup() {
        const value = useRuntimeSelector(form, selector);
        return () => h("span", String(value.value));
      },
    });
    const originalDocument = globalThis.document;
    const html = await renderToString(
      createSSRApp({
        setup() {
          return () => h("div", [h(Probe), h(FormRenderer, { form, adapter: createRecordingAdapter() })]);
        },
      }),
    );
    expect(html).toContain("Ada");
    const afterRender = evaluations;
    form.setValue("name", "Grace");
    expect(evaluations).toBe(afterRender);
    expect(globalThis.document).toBe(originalDocument);
    const leaked: unknown[] = [];
    subscribeRuntime(form, valueSelector("name"), (value) => {
      leaked.push(value);
    });
    form.setValue("name", "Linus");
    expect(leaked).toEqual(["Linus"]);
  });
});
