/** @vitest-environment jsdom */
import { describe, expect, test } from "vitest";
import { cleanup, render, act } from "@testing-library/react";
import { afterEach } from "vitest";
import { FormRenderer } from "@form/react";
import { muiAdapter } from "@form/mui";
import { compileForm, createForm, defineForm } from "@form/core";
import { createDemoForm } from "../../examples/react-mui/src/definition.ts";
import { createDemoRendererEnvironment } from "../../examples/react-mui/src/renderer.tsx";
import { createRecordingAdapter } from "../../packages/react/src/test-utils/fake-adapter.tsx";
import { createArrayForm } from "../../packages/react/src/test-utils/forms.ts";
import { createDemoForm as createVueDemoForm } from "../../examples/vue-element-plus/src/definition.ts";

afterEach(() => {
  cleanup();
});

describe("react + mui integration", () => {
  test("mounts nine widgets with field chrome and ARIA", () => {
    const form = createDemoForm();
    const { container } = render(
      <FormRenderer form={form} environment={createDemoRendererEnvironment()} adapterId="mui" />,
    );
    expect(container.textContent).toContain("Name");
    expect(container.textContent).toContain("Bio");
    expect(container.textContent).toContain("Age");
    expect(container.textContent).toContain("Role");
    expect(container.textContent).toContain("Tags");
    expect(container.textContent).toContain("Active");
    expect(container.textContent).toContain("Alerts");
    expect(container.textContent).toContain("Joined");
    expect(container.textContent).toContain("Meeting");
    expect(container.textContent).toContain("Currency");
    expect(container.querySelector("[aria-labelledby]")).not.toBeNull();
  });

  test("external Core commits overwrite widget displays", () => {
    const form = createDemoForm();
    const { container } = render(
      <FormRenderer form={form} environment={createDemoRendererEnvironment()} adapterId="mui" />,
    );
    act(() => {
      form.setValue("name", "Grace");
      form.setValue("age", 40);
      form.setValue("active", false);
      form.setValue("joined", "2026-01-01");
      form.setValue("meeting", "2026-01-01T00:00:00Z");
    });
    const nameInput = container.querySelector("input") as HTMLInputElement;
    expect(nameInput.value).toBe("Grace");
    const version = form.getState().version;
    act(() => {
      form.reset();
    });
    expect(form.getState().version).toBeGreaterThan(version);
    expect(form.getValue("age")).toBe(36);
    expect(form.getValue("active")).toBe(true);
  });

  test("array move, visibility, and server errors keep Core as the only truth", () => {
    const form = createArrayForm();
    const first = form.array("products").items()[0]!;
    form.setValue("products[0].name", "Alpha");
    form.touch("products[0].name");
    const adapter = createRecordingAdapter();
    const { container } = render(<FormRenderer form={form} adapter={adapter} />);
    act(() => {
      form.array("products").move(0, 2);
    });
    expect(form.array("products").items()[2]?.id).toBe(first.id);
    expect(form.getValue("products[2].name")).toBe("Alpha");
    expect(container.querySelector("[data-layout=array]")).not.toBeNull();
    act(() => {
      form.applyErrors([{ code: "server.taken", instancePath: "products[2].name", message: "server" }]);
    });
    expect(form.getField("products[2].name").getState().errors.some((error) => error.message === "server")).toBe(
      true,
    );
  });

  test("protected props cannot seize Core control", () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties: { name: { type: "string" } } },
          uiSchema: { fields: { name: { native: { mui: { defaultValue: "hack" } } } } },
        }),
      ).model,
      { initialValues: { name: "Ada" } },
    );
    expect(() => render(<FormRenderer form={form} adapter={muiAdapter} />)).toThrow();
    expect(form.getValue("name")).toBe("Ada");
  });
});

describe("cross-stack Core fixture", () => {
  test("React and Vue share values, identity, effective state and submit payload", async () => {
    const reactForm = createDemoForm();
    const vueForm = createVueDemoForm();
    expect(reactForm.getValues()).toEqual(vueForm.getValues());
    expect(reactForm.array("products").items().map((item) => item.id).length).toBe(
      vueForm.array("products").items().map((item) => item.id).length,
    );
    expect(reactForm.getField("name").getState().required).toBe(vueForm.getField("name").getState().required);
    const reactSubmit = await reactForm.submit(async (payload) => payload);
    const vueSubmit = await vueForm.submit(async (payload) => payload);
    expect(reactSubmit.valid).toBe(true);
    expect(vueSubmit.valid).toBe(true);
    expect(reactSubmit.submitted).toBe(true);
    expect(vueSubmit.submitted).toBe(true);
    expect(reactSubmit.payload).toEqual(vueSubmit.payload);
  });
});
