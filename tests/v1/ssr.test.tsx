/** @vitest-environment jsdom */
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, test } from "vitest";
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString as renderReactToString } from "react-dom/server";
import { act } from "@testing-library/react";
import { FormRenderer as VueFormRenderer } from "@xunserver-jsf/vue";
import { FormRenderer as ReactFormRenderer } from "@xunserver-jsf/react";
import { compileV1 } from "../fixtures/v1/index.js";
import { createDemoRendererEnvironment as createVueEnv } from "../lib/demo-element-plus-environment.ts";
import { createRecordingAdapter } from "../../packages/react/src/test-utils/fake-adapter.tsx";
import { subscribeRuntime, valueSelector } from "@xunserver-jsf/core/runtime";

describe("v1 SSR and hydration", () => {
  test("V1-SSR-VUE server-renders a readonly snapshot", async () => {
    const { form } = compileV1("explicit");
    const environment = createVueEnv();
    const html = await renderToString(
      createSSRApp({
        setup() {
          return () => h(VueFormRenderer, { form, environment, adapterId: "element-plus" });
        },
      }),
    );
    expect(html).toContain("Name");
    expect(html).toContain("aria-labelledby");
    const leaked: unknown[] = [];
    const stop = subscribeRuntime(form, valueSelector("name"), (value) => {
      leaked.push(value);
    });
    stop();
    form.setValue("name", "Grace");
    expect(leaked).toEqual([]);
  });

  test("V1-SSR-REACT hydrates and stays precise after StrictMode", async () => {
    const { form } = compileV1("default");
    const adapter = createRecordingAdapter();
    const html = renderReactToString(
      <StrictMode>
        <ReactFormRenderer form={form} adapter={adapter} identifierPrefix="v1" />
      </StrictMode>,
    );
    expect(html).toContain("Ada");
    const container = document.createElement("div");
    container.innerHTML = html;
    hydrateRoot(
      container,
      <StrictMode>
        <ReactFormRenderer form={form} adapter={adapter} identifierPrefix="v1" />
      </StrictMode>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    act(() => {
      form.setValue("name", "Grace");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector("input")?.value ?? form.getValue("name")).toBe("Grace");
  });
});
