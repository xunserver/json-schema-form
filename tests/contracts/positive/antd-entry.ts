import { FormRenderer } from "@form/react";
import { antdAdapter, createAntdAdapter, extendAntdAdapter } from "@form/antd";
import { compileForm, createForm, defineForm } from "@form/core";
import { createElement } from "react";

const form = createForm(
  compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
);

export const element = createElement(FormRenderer, { form, adapter: antdAdapter });
export const created = createAntdAdapter();
export const contribution = extendAntdAdapter({ owner: "app" });
