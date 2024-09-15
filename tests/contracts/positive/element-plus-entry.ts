import { FormRenderer } from "@form/vue";
import { elementPlusAdapter, createElementPlusAdapter, extendElementPlusAdapter } from "@form/element-plus";
import { compileForm, createForm, defineForm } from "@form/core";
import { h } from "vue";

const form = createForm(
  compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
);

export const vnode = h(FormRenderer, { form, adapter: elementPlusAdapter });
export const created = createElementPlusAdapter();
export const contribution = extendElementPlusAdapter({ owner: "app" });
