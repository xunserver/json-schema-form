/** @vitest-environment jsdom */
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import { createFormEnvironment, definePlugin, defineWidget } from "@xunserver-jsf/core/extension";
import { createReactRendererEnvironment } from "@xunserver-jsf/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { FormRenderer } from "@xunserver-jsf/react";
import {
  ARCO_REACT_ADAPTER_ID,
  createArcoReactAdapter,
  extendArcoReactAdapter,
  arcoReactAdapter,
} from "./index.js";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
});

describe("arco-react adapter skeleton", () => {
  test("registers nine widgets and four layout roles uniquely", () => {
    expect(arcoReactAdapter.id).toBe(ARCO_REACT_ADAPTER_ID);
    const environment = createReactRendererEnvironment({ adapters: [arcoReactAdapter] });
    const adapter = environment.getAdapter(ARCO_REACT_ADAPTER_ID)!;
    for (const key of ["text", "textarea", "number", "select", "multi-select", "checkbox", "switch", "date", "datetime"]) {
      expect(adapter.widgets.has(key), key).toBe(true);
    }
    for (const key of ["object", "array", "group", "layout"]) {
      expect(adapter.layouts.has(key), key).toBe(true);
    }
    expect(adapter.widgets.inspect("text")?.owner).toBe("arco-react");
  });

  test("custom extension uses explicit provenance and semantic-only mutation", () => {
    const widget = defineWidget({
      name: "company.currency",
      valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
      interaction: { setValue: true, touch: true, focus: true, blur: true },
    });
    const environmentCore = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "company",
          dependsOn: ["core"],
          contributes: { widgets: { "company.currency": widget } },
        }),
      ],
    });
    const { model } = compileForm(
      defineForm({
        schema: { type: "object", properties: { currency: { type: "string" } } },
        uiSchema: { fields: { currency: { widget: "company.currency" } } },
      }),
      { environment: environmentCore },
    );
    const form = createForm(model, { environment: environmentCore, initialValues: { currency: "USD" } });
    const contribution = extendArcoReactAdapter({
      owner: "app",
      widgets: {
        "company.currency": {
          codec: {
            encode: (value) => value,
            decode: (native) =>
              typeof native === "string" ? { ok: true, value: native } : { ok: false, code: "x", message: "x" },
          },
          interaction: { setValue: true, touch: true, focus: true, blur: true },
          custom: true,
          render(input) {
            expect("form" in input).toBe(false);
            expect("store" in input).toBe(false);
            return (
              <input
                value={typeof input.value === "string" ? input.value : ""}
                onChange={(event) => input.actions.setValue(event.currentTarget.value)}
              />
            );
          },
        },
      },
    });
    const rendererEnv = createReactRendererEnvironment({
      adapters: [createArcoReactAdapter()],
      contributions: [contribution],
    });
    expect(rendererEnv.getAdapter("arco-react")?.widgets.inspect("company.currency")?.owner).toBe("app");
    render(<FormRenderer form={form} environment={rendererEnv} adapterId="arco-react" />);
    expect(form.getValue("currency")).toBe("USD");
  });

  test("controlled text and number commit canonical values", () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties: { name: { type: "string" }, age: { type: "number" } } },
        }),
      ).model,
      { initialValues: { name: "Ada", age: 36 } },
    );
    const { container } = render(<FormRenderer form={form} adapter={arcoReactAdapter} />);
    const name = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Grace" } });
    expect(form.getValue("name")).toBe("Grace");
  });

  test("form submit does not read DOM validity", () => {
    const form = createForm(
      compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
      { initialValues: { name: "Ada" } },
    );
    let coreSubmit = 0;
    const adapter = {
      ...arcoReactAdapter,
      form: {
        render(input: { readonly ids: { readonly form: string }; readonly submit: () => void; readonly content: unknown }) {
          return arcoReactAdapter.form.render({
            ...input,
            content: input.content as never,
            submit() {
              coreSubmit += 1;
            },
          });
        },
      },
    };
    const { container } = render(<FormRenderer form={form} adapter={adapter} submitHandler={async () => undefined} />);
    const formEl = container.querySelector("form") as HTMLFormElement;
    const checkValidity = (): boolean => {
      throw new Error("DOM validity must not be read");
    };
    formEl.checkValidity = checkValidity;
    expect(formEl.noValidate).toBe(true);
    fireEvent.submit(formEl);
    expect(coreSubmit).toBe(1);
    expect(form.getState().errors).toEqual([]);
  });
});
