import { FormRenderer } from "@xunserver-jsf/vue";
import { elementPlusAdapter, createElementPlusAdapter, extendElementPlusAdapter } from "@xunserver-jsf/element-plus";
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import { h } from "vue";

const form = createForm(
  compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
);

export const vnode = h(FormRenderer, { form, adapter: elementPlusAdapter });
export const created = createElementPlusAdapter();
export const contribution = extendElementPlusAdapter({ owner: "app" });
