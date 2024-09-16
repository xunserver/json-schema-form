import { FormRenderer } from "@xunserver-jsf/react";
import { antdAdapter, createAntdAdapter, extendAntdAdapter } from "@xunserver-jsf/antd";
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import { createElement } from "react";

const form = createForm(
  compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
);

export const element = createElement(FormRenderer, { form, adapter: antdAdapter });
export const created = createAntdAdapter();
export const contribution = extendAntdAdapter({ owner: "app" });
