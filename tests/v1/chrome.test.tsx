/** @vitest-environment jsdom */
import { describe, expect, test } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { act, render } from "@testing-library/react";
import { FormRenderer as VueFormRenderer } from "@xunserver-jsf/vue";
import { FormRenderer as ReactFormRenderer } from "@xunserver-jsf/react";
import { compileV1 } from "../fixtures/v1/index.js";
import { createRecordingAdapter as createVueAdapter } from "../../packages/vue/src/test-utils/fake-adapter.js";
import { createRecordingAdapter as createReactAdapter } from "../../packages/react/src/test-utils/fake-adapter.tsx";

describe("v1 chrome and adapter ports", () => {
  test("V1-ADAPTER-CHROME keeps native widgets from writing Core truth", async () => {
    const { form } = compileV1("default");
    const vueAdapter = createVueAdapter();
    const reactAdapter = createReactAdapter();
    const vue = mount(VueFormRenderer, { props: { form, adapter: vueAdapter } });
    await nextTick();
    expect(vue.html()).toMatch(/aria-required|aria-labelledby/);
    const version = form.getState().version;
    expect(vueAdapter.writes).toEqual([]);
    vue.unmount();
    const view = render(<ReactFormRenderer form={form} adapter={reactAdapter} />);
    act(() => {
      form.setValue("name", "Grace");
    });
    expect(form.getState().version).toBeGreaterThan(version);
    expect(reactAdapter.writes).toEqual([]);
    expect(view.container.querySelector("[aria-labelledby]")).not.toBeNull();
  });
});
