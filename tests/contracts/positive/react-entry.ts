import { compileForm, createForm, defineForm } from "@form/core";
import {
  FormRenderer,
  createReactRendererEnvironment,
  defineReactUIAdapter,
  useRuntimeSelector,
  type ReactUIAdapter,
} from "@form/react";
import { createElement } from "react";

const adapter: ReactUIAdapter = defineReactUIAdapter({
  id: "demo",
  protocol: { min: { major: 1, minor: 0 } },
  form: { render: (input) => input.content },
  fieldChrome: { render: (input) => input.control ?? createElement("span") },
  widgets: {},
  layouts: {
    object: { render: (input) => createElement("div", null, ...input.children) },
    array: { render: (input) => createElement("div", null, ...input.children) },
    group: { render: (input) => createElement("div", null, ...input.children) },
    layout: { render: (input) => createElement("div", null, ...input.children) },
  },
});

export const environment = createReactRendererEnvironment({ adapters: [adapter] });

const form = createForm(
  compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
);

export const element = createElement(FormRenderer, { form, adapter });
void useRuntimeSelector;
