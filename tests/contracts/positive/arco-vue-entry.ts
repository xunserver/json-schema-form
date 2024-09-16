import { FormRenderer } from "@xunserver-jsf/vue";
import { arcoVueAdapter, createArcoVueAdapter, extendArcoVueAdapter } from "@xunserver-jsf/arco-vue";
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import { h } from "vue";

const form = createForm(
  compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
);

export const element = h(FormRenderer, { form, adapter: arcoVueAdapter });
export const created = createArcoVueAdapter();
export const contribution = extendArcoVueAdapter({ owner: "app" });
