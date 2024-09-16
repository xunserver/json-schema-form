import { FormRenderer } from "@xunserver-jsf/react";
import { arcoReactAdapter, createArcoReactAdapter, extendArcoReactAdapter } from "@xunserver-jsf/arco-react";
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import { createElement } from "react";

const form = createForm(
  compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
);

export const element = createElement(FormRenderer, { form, adapter: arcoReactAdapter });
export const created = createArcoReactAdapter();
export const contribution = extendArcoReactAdapter({ owner: "app" });
