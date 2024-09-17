import { FormRenderer } from "@xunserver-jsf/react";
import { createShadcnAdapter, extendShadcnAdapter, type ShadcnAdapterComponents } from "@xunserver-jsf/shadcn";
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import { createElement, type ReactNode } from "react";

const components = {
  Input: (props: Record<string, unknown>) => createElement("input", props),
  Textarea: (props: Record<string, unknown>) => createElement("textarea", props),
  Checkbox: (props: Record<string, unknown>) => createElement("input", { type: "checkbox", ...props }),
  Switch: (props: Record<string, unknown>) => createElement("input", { type: "checkbox", role: "switch", ...props }),
  Button: (props: { children?: ReactNode }) => createElement("button", { type: "button" }, props.children),
  Select: (props: { children?: ReactNode }) => createElement("div", null, props.children),
  SelectTrigger: (props: { children?: ReactNode }) => createElement("div", null, props.children),
  SelectContent: (props: { children?: ReactNode }) => createElement("div", null, props.children),
  SelectItem: (props: { children?: ReactNode }) => createElement("div", null, props.children),
  SelectGroup: (props: { children?: ReactNode }) => createElement("div", null, props.children),
  SelectValue: () => null,
  Combobox: () => createElement("select", { multiple: true }),
  Field: (props: { children?: ReactNode }) => createElement("div", null, props.children),
  FieldLabel: (props: { children?: ReactNode }) => createElement("label", null, props.children),
  FieldDescription: (props: { children?: ReactNode }) => createElement("p", null, props.children),
  FieldError: (props: { children?: ReactNode }) => createElement("p", null, props.children),
  FieldGroup: (props: { children?: ReactNode }) => createElement("div", null, props.children),
  Card: (props: { children?: ReactNode }) => createElement("section", null, props.children),
} as unknown as ShadcnAdapterComponents;

const form = createForm(
  compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
);

export const adapter = createShadcnAdapter({ components });
export const element = createElement(FormRenderer, { form, adapter });
export const contribution = extendShadcnAdapter({ owner: "app" });
