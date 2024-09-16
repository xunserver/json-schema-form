/** @vitest-environment jsdom */
import { compileForm, createForm, defineForm } from "@form/core";
import { createFormEnvironment, definePlugin, defineWidget } from "@form/core/extension";
import { createReactRendererEnvironment, FormRenderer, RENDERER_DIAGNOSTIC_CODES } from "@form/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import type { ComponentProps, ReactNode } from "react";
import {
  createShadcnAdapter,
  extendShadcnAdapter,
  PROTECTED_NATIVE_KEYS,
  SHADCN_ADAPTER_ID,
  ShadcnAdapterConfigurationError,
  type ShadcnAdapterComponents,
} from "./index.js";
import { mapShadcnProps } from "./widgets/mapper.js";
import { numberCodec, stringCodec } from "./widgets/codecs.js";

afterEach(() => {
  cleanup();
});

function StubInput(props: ComponentProps<"input">) {
  return <input {...props} />;
}

function StubTextarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} />;
}

function StubCheckbox(props: {
  checked?: boolean;
  disabled?: boolean;
  id?: string;
  onCheckedChange?: (checked: boolean) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <input
      type="checkbox"
      id={props.id}
      checked={props.checked === true}
      disabled={props.disabled}
      aria-labelledby={props["aria-labelledby"]}
      aria-invalid={props["aria-invalid"]}
      aria-required={props["aria-required"]}
      aria-describedby={props["aria-describedby"]}
      onChange={(event) => props.onCheckedChange?.(event.target.checked)}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
    />
  );
}

function StubSwitch(props: {
  checked?: boolean;
  disabled?: boolean;
  id?: string;
  onCheckedChange?: (checked: boolean) => void;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      id={props.id}
      checked={props.checked === true}
      disabled={props.disabled}
      aria-labelledby={props["aria-labelledby"]}
      aria-invalid={props["aria-invalid"]}
      aria-required={props["aria-required"]}
      aria-describedby={props["aria-describedby"]}
      onChange={(event) => props.onCheckedChange?.(event.target.checked)}
    />
  );
}

function StubButton(props: { type?: "button" | "submit" | "reset"; children?: ReactNode }) {
  return <button type={props.type ?? "button"}>{props.children}</button>;
}

function StubSelect(props: {
  value?: string | null;
  onValueChange?: (value: string | null) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const options: { value: string; label: string }[] = [];
  collectSelectItems(props.children, options);
  return (
    <select
      value={props.value ?? ""}
      disabled={props.disabled}
      onChange={(event) => props.onValueChange?.(event.target.value === "" ? null : event.target.value)}
    >
      <option value="" />
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function collectSelectItems(node: ReactNode, out: { value: string; label: string }[]): void {
  if (node === null || node === undefined || typeof node === "boolean") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectSelectItems(child, out);
    }
    return;
  }
  if (typeof node === "object" && "props" in node) {
    const element = node as { props: { value?: string; children?: ReactNode } };
    if (typeof element.props.value === "string") {
      out.push({
        value: element.props.value,
        label: typeof element.props.children === "string" ? element.props.children : element.props.value,
      });
    }
    collectSelectItems(element.props.children, out);
  }
}

function StubPassthrough(props: { children?: ReactNode; id?: string; htmlFor?: string; role?: string }) {
  return <div id={props.id} role={props.role}>{props.children}</div>;
}

function StubCombobox(props: {
  value: readonly string[];
  onValueChange: (value: string[]) => void;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  id?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <select
      multiple
      id={props.id}
      disabled={props.disabled}
      value={[...props.value]}
      aria-labelledby={props["aria-labelledby"]}
      aria-invalid={props["aria-invalid"]}
      aria-required={props["aria-required"]}
      aria-describedby={props["aria-describedby"]}
      onChange={(event) => {
        const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
        props.onValueChange(selected);
      }}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function StubCollapsible(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section>
      <button type="button" onClick={() => props.onOpenChange(!props.open)}>
        {props.title}
      </button>
      {props.open ? <div>{props.children}</div> : null}
    </section>
  );
}

function createStubComponents(
  overrides?: Partial<ShadcnAdapterComponents>,
): ShadcnAdapterComponents {
  return {
    Input: StubInput,
    Textarea: StubTextarea,
    Checkbox: StubCheckbox,
    Switch: StubSwitch,
    Button: StubButton,
    Select: StubSelect,
    SelectTrigger: ({ children, ...rest }) => <div {...rest}>{children}</div>,
    SelectContent: ({ children }) => <>{children}</>,
    SelectItem: ({ children }) => <>{children}</>,
    SelectGroup: ({ children }) => <>{children}</>,
    SelectValue: () => null,
    Combobox: StubCombobox,
    Field: ({ children, ...rest }) => <div {...rest}>{children}</div>,
    FieldLabel: StubPassthrough,
    FieldDescription: StubPassthrough,
    FieldError: StubPassthrough,
    FieldGroup: ({ children }) => <div>{children}</div>,
    Collapsible: StubCollapsible,
    ...overrides,
  };
}

describe("shadcn adapter", () => {
  test("fail closed when required slots are missing", () => {
    expect(() =>
      createShadcnAdapter({
        components: createStubComponents({ Input: undefined as never }),
      }),
    ).toThrow(ShadcnAdapterConfigurationError);
  });

  test("registers nine widgets and four layout roles uniquely", () => {
    const adapter = createShadcnAdapter({ components: createStubComponents() });
    expect(adapter.id).toBe(SHADCN_ADAPTER_ID);
    const environment = createReactRendererEnvironment({ adapters: [adapter] });
    const resolved = environment.getAdapter(SHADCN_ADAPTER_ID)!;
    for (const key of ["text", "textarea", "number", "select", "multi-select", "checkbox", "switch", "date", "datetime"]) {
      expect(resolved.widgets.has(key), key).toBe(true);
    }
    for (const key of ["object", "array", "group", "layout"]) {
      expect(resolved.layouts.has(key), key).toBe(true);
    }
    expect(resolved.widgets.inspect("text")?.owner).toBe("shadcn");
  });

  test("controlled text commits canonical values", () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties: { name: { type: "string" } } },
        }),
      ).model,
      { initialValues: { name: "Ada" } },
    );
    const adapter = createShadcnAdapter({ components: createStubComponents() });
    const { container } = render(<FormRenderer form={form} adapter={adapter} />);
    const name = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Grace" } });
    expect(form.getValue("name")).toBe("Grace");
  });

  test("number codec rejects non-finite values", () => {
    expect(numberCodec.decode("").ok).toBe(true);
    expect(numberCodec.decode("12").ok).toBe(true);
    expect(numberCodec.decode("NaN").ok).toBe(false);
    expect(stringCodec.decode(1).ok).toBe(false);
  });

  test("mapper rejects protected keys and ignores other namespaces", () => {
    expect(PROTECTED_NATIVE_KEYS.has("value")).toBe(true);
    const field = {
      path: "name",
      widget: "text",
      props: {},
      native: { shadcn: { placeholder: "x" }, antd: { size: "large" } },
    };
    const input = {
      field,
      view: { id: "v1" },
      nativeProps: {},
    } as never;
    expect(mapShadcnProps(input)).toEqual({ placeholder: "x" });
    expect(() =>
      mapShadcnProps({
        ...input,
        field: { ...field, native: { shadcn: { value: "hack" } } },
      } as never),
    ).toThrowError(/Protected native key/);
  });

  test("form submit does not read DOM validity", () => {
    const form = createForm(
      compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
      { initialValues: { name: "Ada" } },
    );
    let coreSubmit = 0;
    const base = createShadcnAdapter({ components: createStubComponents() });
    const adapter = {
      ...base,
      form: {
        render(input: { readonly ids: { readonly form: string }; readonly submit: () => void; readonly content: unknown }) {
          return base.form.render({
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
    formEl.checkValidity = () => {
      throw new Error("DOM validity must not be read");
    };
    expect(formEl.noValidate).toBe(true);
    fireEvent.submit(formEl);
    expect(coreSubmit).toBe(1);
  });

  test("custom extension uses explicit provenance", () => {
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
    const contribution = extendShadcnAdapter({
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
      adapters: [createShadcnAdapter({ components: createStubComponents() })],
      contributions: [contribution],
    });
    expect(rendererEnv.getAdapter("shadcn")?.widgets.inspect("company.currency")?.owner).toBe("app");
    render(<FormRenderer form={form} environment={rendererEnv} adapterId="shadcn" />);
    expect(form.getValue("currency")).toBe("USD");
  });

  test("missing capability diagnostic code is stable", () => {
    try {
      createShadcnAdapter({ components: createStubComponents({ Combobox: undefined as never }) });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ShadcnAdapterConfigurationError);
      const diagnostic = (error as ShadcnAdapterConfigurationError).diagnostic;
      expect(diagnostic.code).toBe(RENDERER_DIAGNOSTIC_CODES.MISSING_CAPABILITY);
    }
  });
});
