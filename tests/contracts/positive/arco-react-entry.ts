import { FormRenderer } from "@form/react";
import { arcoReactAdapter, createArcoReactAdapter, extendArcoReactAdapter } from "@form/arco-react";
import { compileForm, createForm, defineForm } from "@form/core";
import { createElement } from "react";

const form = createForm(
  compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
);

export const element = createElement(FormRenderer, { form, adapter: arcoReactAdapter });
export const created = createArcoReactAdapter();
export const contribution = extendArcoReactAdapter({ owner: "app" });
