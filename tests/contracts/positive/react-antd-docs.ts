import { defineForm, compileForm, createForm } from "@form/core";
import { FormRenderer, createReactRendererEnvironment } from "@form/react";
import { antdAdapter, createAntdAdapter, extendAntdAdapter } from "@form/antd";
import { createElement } from "react";
import type { FormInstance } from "@form/core";
import type { ReactRendererEnvironment } from "@form/react";

const { model } = compileForm(
  defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } }),
);
const form = createForm(model, { initialValues: { name: "Ada" } });
export const element = createElement(FormRenderer, { form, adapter: antdAdapter });

export const environment = createReactRendererEnvironment({
  adapters: [createAntdAdapter()],
  contributions: [extendAntdAdapter({ owner: "app" })],
  overrides: [
    {
      adapterId: "antd",
      registry: "widgets",
      key: "text",
      expectedOwner: "antd",
      replacementOwner: "app",
    },
  ],
});

export function renderAdvanced(instance: FormInstance, env: ReactRendererEnvironment) {
  return createElement(FormRenderer, { form: instance, environment: env, adapterId: "antd" });
}
