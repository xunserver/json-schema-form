import { defineForm, compileForm, createForm } from "@xunserver-jsf/core";
import { FormRenderer, createReactRendererEnvironment } from "@xunserver-jsf/react";
import { antdAdapter, createAntdAdapter, extendAntdAdapter } from "@xunserver-jsf/antd";
import { createElement } from "react";
import type { FormInstance } from "@xunserver-jsf/core";
import type { ReactRendererEnvironment } from "@xunserver-jsf/react";

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
