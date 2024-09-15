/** @vitest-environment jsdom */
import { compileForm, createForm, defineForm } from "@form/core";
import { createFormEnvironment, definePlugin, defineWidget } from "@form/core/extension";
import { createReactRendererEnvironment } from "@form/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { FormRenderer } from "@form/react";
import { MUI_ADAPTER_ID, createMuiAdapter, extendMuiAdapter, muiAdapter } from "./index.js";

afterEach(() => {
  cleanup();
});

describe("mui adapter skeleton", () => {
  test("registers nine widgets and four layout roles uniquely", () => {
    expect(muiAdapter.id).toBe(MUI_ADAPTER_ID);
    const environment = createReactRendererEnvironment({ adapters: [muiAdapter] });
    const adapter = environment.getAdapter(MUI_ADAPTER_ID)!;
    for (const key of ["text", "textarea", "number", "select", "multi-select", "checkbox", "switch", "date", "datetime"]) {
      expect(adapter.widgets.has(key), key).toBe(true);
    }
    for (const key of ["object", "array", "group", "layout"]) {
      expect(adapter.layouts.has(key), key).toBe(true);
    }
    expect(adapter.widgets.inspect("text")?.owner).toBe("mui");
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
    const contribution = extendMuiAdapter({
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
      adapters: [createMuiAdapter()],
      contributions: [contribution],
    });
    expect(rendererEnv.getAdapter("mui")?.widgets.inspect("company.currency")?.owner).toBe("app");
    render(<FormRenderer form={form} environment={rendererEnv} adapterId="mui" />);
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
    const { container } = render(<FormRenderer form={form} adapter={muiAdapter} />);
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
      ...muiAdapter,
      form: {
        render(input: { readonly ids: { readonly form: string }; readonly submit: () => void; readonly content: unknown }) {
          return muiAdapter.form.render({
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
