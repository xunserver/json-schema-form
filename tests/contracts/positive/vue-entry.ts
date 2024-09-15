import { compileForm, createForm, defineForm } from "@form/core";
import {
  FormRenderer,
  createVueRendererEnvironment,
  defineVueUIAdapter,
  useRuntimeSelector,
  type VueUIAdapter,
} from "@form/vue";
import { h } from "vue";

const adapter: VueUIAdapter = defineVueUIAdapter({
  id: "demo",
  protocol: { min: { major: 1, minor: 0 } },
  form: { render: (input) => input.content },
  fieldChrome: { render: (input) => input.control ?? h("span") },
  widgets: {},
  layouts: {
    object: { render: (input) => h("div", [...input.children]) },
    array: { render: (input) => h("div", [...input.children]) },
    group: { render: (input) => h("div", [...input.children]) },
    layout: { render: (input) => h("div", [...input.children]) },
  },
});

export const environment = createVueRendererEnvironment({ adapters: [adapter] });

const form = createForm(
  compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
);

export const vnode = h(FormRenderer, { form, adapter });
void useRuntimeSelector;
