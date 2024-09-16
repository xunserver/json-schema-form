/** @vitest-environment jsdom */
import { describe, expect, test } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach } from "vitest";
import { FormRenderer } from "@xunserver-jsf/react";
import { applySemanticSteps, compileV1, observeForm } from "../fixtures/v1/index.js";
import { createDemoRendererEnvironment } from "../lib/demo-antd-environment.tsx";

afterEach(() => {
  cleanup();
});

describe("v1 react stack", () => {
  test("V1-CROSS-STACK-REACT renders the shared fixture through Ant Design", async () => {
    const { form } = compileV1("explicit");
    const view = render(
      <FormRenderer form={form} environment={createDemoRendererEnvironment()} adapterId="antd" />,
    );
    expect(view.container.textContent).toContain("Name");
    const previousIds = form.array("products").items().map((item) => item.id);
    const submitted = await act(async () => applySemanticSteps(form));
    const observation = observeForm(form, { previousIds, submitted });
    expect(observation.values).toMatchObject({ name: "Grace" });
    expect(view.container.textContent).not.toContain("@xunserver-jsf/vue");
  });
});
