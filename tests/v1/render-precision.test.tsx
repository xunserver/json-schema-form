/** @vitest-environment jsdom */
import { describe, expect, test } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { memo } from "react";
import { render, act } from "@testing-library/react";
import { FormRenderer as VueFormRenderer, useRuntimeSelector } from "@xunserver-jsf/vue";
import { FormRenderer as ReactFormRenderer, useRuntimeSelector as useReactSelector } from "@xunserver-jsf/react";
import { valueSelector } from "@xunserver-jsf/core/runtime";
import { compileV1 } from "../fixtures/v1/index.js";
import { createRecordingAdapter as createVueAdapter } from "../../packages/vue/src/test-utils/fake-adapter.js";
import { createRecordingAdapter as createReactAdapter } from "../../packages/react/src/test-utils/fake-adapter.tsx";

describe("v1 render precision", () => {
  test("V1-RENDER-PRECISION does not rerender an unrelated leaf", async () => {
    const { form } = compileV1("default");
    let vueName = 0;
    const VueProbe = defineComponent({
      setup() {
        const value = useRuntimeSelector(form, valueSelector("name"));
        vueName += 1;
        return () => h("span", { "data-probe": "vue-name" }, String(value.value));
      },
    });
    const vueAdapter = createVueAdapter();
    const vue = mount({
      setup() {
        return () =>
          h("div", [h(VueFormRenderer, { form, adapter: vueAdapter }), h(VueProbe)]);
      },
    });
    await nextTick();
    const beforeVue = vueName;
    form.setValue("age", 40);
    await nextTick();
    expect(vueName).toBe(beforeVue);
    vue.unmount();

    let reactName = 0;
    const ReactProbe = memo(function ReactProbe() {
      reactName += 1;
      useReactSelector(form, valueSelector("name"));
      return <span data-probe="react-name">name</span>;
    });
    const reactAdapter = createReactAdapter();
    render(
      <div>
        <ReactFormRenderer form={form} adapter={reactAdapter} />
        <ReactProbe />
      </div>,
    );
    const beforeReact = reactName;
    act(() => {
      form.setValue("bio", "x");
    });
    expect(reactName).toBe(beforeReact);
  });
});
