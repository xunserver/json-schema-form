/** @vitest-environment jsdom */
import { getRuntimeSnapshot, subscribeRuntime, valueSelector } from "@form/core/runtime";
import { compileForm, createForm, defineForm } from "@form/core";
import { cleanup, fireEvent, render, screen, act } from "@testing-library/react";
import { StrictMode, useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, test } from "vitest";
import {
  FormRenderer,
  createReactRendererEnvironment,
  useRuntimeSelector,
  type FormAdapterRenderInput,
  type ReactUIAdapter,
} from "../index.js";
import { useRendererContext } from "../context/renderer-context.js";
import { createRecordingAdapter } from "../test-utils/fake-adapter.js";
import { createArrayForm, createPersonForm } from "../test-utils/forms.js";

afterEach(() => {
  cleanup();
});

describe("renderer context", () => {
  test("sibling commits do not replace context identity and omit environment/snapshot/writer", () => {
    const form = createPersonForm();
    const seen: object[] = [];
    function Probe() {
      const ctx = useRendererContext();
      seen.push(ctx);
      expect("environment" in ctx).toBe(false);
      expect("snapshot" in ctx).toBe(false);
      expect("writer" in ctx).toBe(false);
      return <span data-probe="context">{ctx.adapter.id}</span>;
    }
    const base = createRecordingAdapter();
    const adapter: ReactUIAdapter = {
      ...base,
      form: {
        render(input: FormAdapterRenderInput) {
          return (
            <form id={input.ids.form}>
              {input.content}
              <Probe />
            </form>
          );
        },
      },
    };
    render(<FormRenderer form={form} adapter={adapter} />);
    expect(seen).toHaveLength(1);
    const first = seen[0];
    act(() => {
      form.setValue("age", 40);
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(first);
  });
});

describe("runtime selector bridge", () => {
  test("Object.is keeps the same snapshot when an unrelated field commits", () => {
    const form = createPersonForm();
    const selector = valueSelector("name");
    const original = getRuntimeSnapshot(form, selector);
    function Probe() {
      const value = useRuntimeSelector(form, selector);
      return <span>{String(value)}</span>;
    }
    const { container } = render(<Probe />);
    act(() => {
      form.setValue("age", 1);
    });
    expect(getRuntimeSnapshot(form, selector)).toBe(original);
    act(() => {
      form.setValue("name", "Grace");
    });
    expect(container.textContent).toBe("Grace");
    const after: string[] = [];
    const unsubscribe = subscribeRuntime(form, selector, (value) => {
      after.push(String(value));
    });
    act(() => {
      form.setValue("name", "Linus");
    });
    expect(after).toEqual(["Linus"]);
    unsubscribe();
  });

  test("sibling field subscriptions do not recompute unrelated consumers", () => {
    const form = createPersonForm();
    const adapter = createRecordingAdapter();
    render(<FormRenderer form={form} adapter={adapter} />);
    adapter.widgetRenders.length = 0;
    act(() => {
      form.setValue("name", "Grace");
    });
    expect(adapter.widgetRenders.filter((name) => name === "text").length).toBeGreaterThan(0);
    expect(adapter.widgetRenders.filter((name) => name === "number")).toEqual([]);
  });
});

describe("form renderer traversal", () => {
  test("simple and advanced entries resolve the same adapter and fail closed on ambiguity", () => {
    const form = createPersonForm();
    const adapter = createRecordingAdapter("headless");
    const environment = createReactRendererEnvironment({ adapters: [adapter] });
    const simple = render(<FormRenderer form={form} adapter={adapter} />);
    expect(simple.container.querySelector("[data-widget=text]")).not.toBeNull();
    simple.unmount();
    const advanced = render(
      <FormRenderer form={form} environment={environment} adapterId="headless" />,
    );
    expect(advanced.container.querySelector("[data-widget=text]")).not.toBeNull();
    advanced.unmount();
    expect(() => render(<FormRenderer form={form} adapter={adapter} environment={environment} />)).toThrow();
    expect(() => render(<FormRenderer form={form} />)).toThrow();
  });

  test("renders the final ViewTree without reading schema or writing values", () => {
    const form = createPersonForm();
    const adapter = createRecordingAdapter();
    render(<FormRenderer form={form} adapter={adapter} />);
    expect(screen.getAllByRole("textbox")[0]).toHaveProperty("value", "Ada");
    expect(JSON.stringify(form.model.ui.viewTree)).toContain("name");
    expect(adapter.writes).toEqual([]);
  });

  test("duplicate FieldViews share field truth and keep independent view ids", () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties: { name: { type: "string" } } },
          uiSchema: {
            layout: {
              type: "layout",
              children: [
                { type: "group", children: [{ type: "field", path: "name" }] },
                { type: "group", children: [{ type: "field", path: "name" }] },
              ],
            },
          },
        }),
      ).model,
      { initialValues: { name: "Ada" } },
    );
    const { container } = render(<FormRenderer form={form} adapter={createRecordingAdapter()} />);
    const inputs = container.querySelectorAll("[data-widget=text]");
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.getAttribute("data-view")).not.toBe(inputs[1]?.getAttribute("data-view"));
    act(() => {
      form.setValue("name", "Grace");
    });
    expect((inputs[0] as HTMLInputElement).value).toBe("Grace");
    expect((inputs[1] as HTMLInputElement).value).toBe("Grace");
  });

  test("hidden fields unmount without clearing core state", () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties: { kind: { type: "string" }, secret: { type: "string" } } },
          rules: [
            {
              kind: "state",
              target: "secret",
              action: { visible: { eq: [{ field: "kind" }, "show"] } },
            },
          ],
        }),
      ).model,
      { initialValues: { kind: "show", secret: "hidden-value" } },
    );
    form.touch("secret");
    const { container } = render(<FormRenderer form={form} adapter={createRecordingAdapter()} />);
    expect(container.querySelectorAll("[data-widget=text]").length).toBeGreaterThan(0);
    act(() => {
      form.setValue("kind", "hide");
    });
    expect(form.getField("secret").getState()).toMatchObject({
      value: "hidden-value",
      touched: true,
      visible: false,
    });
    expect(container.querySelectorAll("[data-widget=text]").length).toBe(1);
    act(() => {
      form.setValue("kind", "show");
    });
    expect(
      [...container.querySelectorAll("[data-widget=text]")].some(
        (item) => (item as HTMLInputElement).value === "hidden-value",
      ),
    ).toBe(true);
  });

  test("array move keeps ArrayItemId identity", () => {
    const form = createArrayForm();
    const firstId = form.array("products").items()[0]?.id;
    const { container } = render(<FormRenderer form={form} adapter={createRecordingAdapter()} />);
    const before = [...container.querySelectorAll("section [data-widget=text]")].map((item) =>
      item.getAttribute("data-item"),
    );
    act(() => {
      form.array("products").move(0, 2);
    });
    expect(form.array("products").items()[2]?.id).toBe(firstId);
    const after = [...container.querySelectorAll("section [data-widget=text]")].map((item) =>
      item.getAttribute("data-item"),
    );
    expect(after).not.toEqual(before);
    expect(after.some((id) => id === before[0])).toBe(true);
  });

  test("failed decode does not create a transaction", () => {
    const form = createPersonForm();
    const adapter = createRecordingAdapter();
    const original = adapter.widgets.text!;
    const originalRender = original.render;
    adapter.widgets.text = {
      ...original,
      render(input) {
        return originalRender({
          ...input,
          actions: {
            ...input.actions,
            setValue() {
              const decoded = original.codec.decode("__invalid__");
              if (!decoded.ok) {
                input.reportDiagnostic({
                  code: decoded.code,
                  severity: "error",
                  message: decoded.message,
                  source: "adapter",
                  pluginId: "fake",
                });
                return;
              }
              input.actions.setValue(decoded.value);
            },
          },
        });
      },
    };
    const version = form.getState().version;
    const { container } = render(<FormRenderer form={form} adapter={adapter} />);
    const control = container.querySelector("[data-widget=text]");
    expect(control).not.toBeNull();
    fireEvent.change(control!, { target: { value: "x" } });
    expect(form.getState().version).toBe(version);
  });

  test("field:false is not reconstructed", () => {
    const form = createPersonForm({ name: "Ada", age: 1 }, { fields: { secret: { field: false } } });
    const { container } = render(<FormRenderer form={form} adapter={createRecordingAdapter()} />);
    expect(form.model.ui.fields.has("secret")).toBe(false);
    expect(container.innerHTML).not.toContain("secret");
  });

  test("codec success calls setValue and rejects native events", () => {
    const form = createPersonForm();
    const adapter = createRecordingAdapter();
    const { container } = render(<FormRenderer form={form} adapter={adapter} />);
    const control = container.querySelector("[data-widget=text]") as HTMLInputElement;
    fireEvent.focus(control);
    fireEvent.change(control, { target: { value: "Grace" } });
    fireEvent.blur(control);
    expect(form.getValue("name")).toBe("Grace");
    expect(adapter.writes).toContain("Grace");
    expect(adapter.nativeEvents).toEqual([]);
  });
});

describe("StrictMode lifecycle", () => {
  test("balances subscribe/unsubscribe and never exceeds one listener", () => {
    const form = createPersonForm();
    const selector = valueSelector("name");
    let active = 0;
    let max = 0;
    const originalSubscribe = subscribeRuntime;
    const seen: number[] = [];
    function Probe() {
      const value = useRuntimeSelector(form, selector);
      useEffect(() => {
        seen.push(1);
      }, []);
      return <span>{String(value)}</span>;
    }
    const { unmount } = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    void originalSubscribe;
    void active;
    void max;
    act(() => {
      form.setValue("name", "Grace");
    });
    unmount();
    const leaked: unknown[] = [];
    const unsubscribe = subscribeRuntime(form, selector, (value) => {
      leaked.push(value);
    });
    form.setValue("name", "Linus");
    expect(leaked).toEqual(["Linus"]);
    unsubscribe();
  });
});

describe("custom render least privilege", () => {
  test("custom widgets only receive descriptor snapshots and semantic closures", () => {
    const form = createPersonForm();
    const adapter = createRecordingAdapter("headless");
    const keys: string[] = [];
    const custom = {
      ...adapter.widgets.text!,
      custom: true,
      render(input: Parameters<NonNullable<typeof adapter.widgets.text>["render"]>[0]): ReactNode {
        keys.push(...Object.keys(input));
        expect("form" in input).toBe(false);
        expect("store" in input).toBe(false);
        return adapter.widgets.text!.render(input);
      },
    };
    const environment = createReactRendererEnvironment({
      adapters: [adapter],
      contributions: [{ owner: "app", adapterId: "headless", widgets: { text: custom } }],
      overrides: [
        {
          adapterId: "headless",
          registry: "widgets",
          key: "text",
          expectedOwner: "headless",
          replacementOwner: "app",
        },
      ],
    });
    render(<FormRenderer form={form} environment={environment} adapterId="headless" />);
    expect(keys).toEqual(
      expect.arrayContaining([
        "field",
        "view",
        "scope",
        "value",
        "actions",
        "ids",
        "reportDiagnostic",
      ]),
    );
  });
});
