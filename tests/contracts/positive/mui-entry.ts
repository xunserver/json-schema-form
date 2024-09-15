import { FormRenderer } from "@form/react";
import { muiAdapter, createMuiAdapter, extendMuiAdapter } from "@form/mui";
import { compileForm, createForm, defineForm } from "@form/core";
import { createElement } from "react";

const form = createForm(
  compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
);

export const element = createElement(FormRenderer, { form, adapter: muiAdapter });
export const created = createMuiAdapter();
export const contribution = extendMuiAdapter({ owner: "app" });
