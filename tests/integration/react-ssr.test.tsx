/** @vitest-environment jsdom */
import { describe, expect, test } from "vitest";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { StrictMode } from "react";
import { act } from "@testing-library/react";
import { FormRenderer } from "@xunserver-jsf/react";
import { createRecordingAdapter } from "../../packages/react/src/test-utils/fake-adapter.tsx";
import { createPersonForm } from "../../packages/react/src/test-utils/forms.ts";

describe("react hydration and StrictMode", () => {
  test("server markup hydrates and later commits update the client", async () => {
    const form = createPersonForm();
    const adapter = createRecordingAdapter();
    const html = renderToString(
      <FormRenderer form={form} adapter={adapter} identifierPrefix="hyd" />,
    );
    expect(html).toContain("Ada");
    const container = document.createElement("div");
    container.innerHTML = html;
    hydrateRoot(container, <FormRenderer form={form} adapter={adapter} identifierPrefix="hyd" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    act(() => {
      form.setValue("name", "Grace");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const input = container.querySelector("[data-widget=text]") as HTMLInputElement;
    expect(input.value).toBe("Grace");
  });

  test("StrictMode remount does not leak listeners", () => {
    const form = createPersonForm();
    const adapter = createRecordingAdapter();
    const html = renderToString(
      <StrictMode>
        <FormRenderer form={form} adapter={adapter} identifierPrefix="strict" />
      </StrictMode>,
    );
    expect(html).toContain("Ada");
  });
});
