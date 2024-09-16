/** @vitest-environment jsdom */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import { FormRenderer } from "@xunserver-jsf/react";
import { antdAdapter } from "@xunserver-jsf/antd";
import { arcoReactAdapter } from "@xunserver-jsf/arco-react";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

function requiredNameForm() {
  return createForm(
    compileForm(
      defineForm({
        schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
        uiSchema: { fields: { name: { display: { label: "姓名" } } } },
      }),
    ).model,
    { initialValues: { name: "Ada" } },
  );
}

describe("adapter presentable errors", () => {
  test("antd renders Core errors in Form.Item help", () => {
    const form = requiredNameForm();
    const { container } = render(<FormRenderer form={form} adapter={antdAdapter} />);
    act(() => {
      form.applyErrors([{ code: "required", instancePath: "name", message: "必须填写姓名" }]);
      form.touch("name");
    });
    const alert = container.querySelector("[role=alert]");
    expect(alert?.textContent).toBe("必须填写姓名");
    expect(container.querySelector(".ant-form-item-has-error")).not.toBeNull();
    expect(container.querySelector(".ant-form-item-explain")).not.toBeNull();
  });

  test("arco-react renders Core errors in Form.Item help", () => {
    const form = requiredNameForm();
    const { container } = render(<FormRenderer form={form} adapter={arcoReactAdapter} />);
    act(() => {
      form.applyErrors([{ code: "required", instancePath: "name", message: "必须填写姓名" }]);
      form.touch("name");
    });
    const alert = container.querySelector("[role=alert]");
    expect(alert?.textContent).toBe("必须填写姓名");
    expect(container.querySelector(".arco-form-item-error")).not.toBeNull();
    expect(alert?.closest(".arco-form-message")).not.toBeNull();
  });
});
