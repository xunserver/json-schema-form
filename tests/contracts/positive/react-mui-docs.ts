import { defineForm, compileForm, createForm } from "@form/core";
import { FormRenderer, createReactRendererEnvironment } from "@form/react";
import { muiAdapter, createMuiAdapter, extendMuiAdapter } from "@form/mui";
import { createElement } from "react";
import type { FormInstance } from "@form/core";
import type { ReactRendererEnvironment } from "@form/react";

const { model } = compileForm(
  defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } }),
);
const form = createForm(model, { initialValues: { name: "Ada" } });
export const element = createElement(FormRenderer, { form, adapter: muiAdapter });

export const environment = createReactRendererEnvironment({
  adapters: [createMuiAdapter()],
  contributions: [extendMuiAdapter({ owner: "app" })],
  overrides: [
    {
      adapterId: "mui",
      registry: "widgets",
      key: "text",
      expectedOwner: "mui",
      replacementOwner: "app",
    },
  ],
});

export function renderAdvanced(instance: FormInstance, env: ReactRendererEnvironment) {
  return createElement(FormRenderer, { form: instance, environment: env, adapterId: "mui" });
}
