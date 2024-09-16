import {
  arrayOrderSelector,
  currentBindingSelector,
  effectiveStateSelector,
  fieldSelector,
  formSelector,
  getRenderScope,
  getRuntimeSnapshot,
  presentableErrorSelector,
  subscribeRuntime,
  viewSelector,
} from "@xunserver-jsf/core/runtime";
import type { InstanceBinding, RenderScope } from "@xunserver-jsf/core/runtime";
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import { defineWidget, FULL_WIDGET_INTERACTION } from "@xunserver-jsf/core/extension";
import type { SemanticActions, WidgetRenderInput } from "@xunserver-jsf/react";

const form = createForm(
  compileForm(
    defineForm({
      schema: { type: "object", properties: { title: { type: "string" } } },
    }),
  ).model,
  { initialValues: { title: "Ada" } },
);

export const snapshot = getRuntimeSnapshot(form, fieldSelector("title"));
export const required = getRuntimeSnapshot(form, effectiveStateSelector("title")).required;
export const view = getRuntimeSnapshot(form, viewSelector(form.model.ui.viewTree.id));
export const collapsed = view.collapsed;
export const activeTab = view.activeTab;
export const presentable = getRuntimeSnapshot(form, presentableErrorSelector("title"));
export const unsubscribe = subscribeRuntime(form, formSelector(), () => undefined);
export const scope: RenderScope = getRenderScope(form);
export const binding: InstanceBinding = scope.binding;
export const order = arrayOrderSelector("title");
void currentBindingSelector("title");

form.setValue("title", "Grace");
form.touch("title");
form.focus(form.model.ui.viewTree.id);
form.blur(form.model.ui.viewTree.id);
form.setCollapsed(form.model.ui.viewTree.id, true);
form.setActiveTab(form.model.ui.viewTree.id, null);

export const widget = defineWidget({
  name: "sku",
  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
  interaction: FULL_WIDGET_INTERACTION,
});

function assertActions(actions: SemanticActions): void {
  actions.setValue("x");
  actions.touch();
  actions.focus();
  actions.blur();
}

void snapshot;
void required;
void collapsed;
void activeTab;
void presentable;
void unsubscribe;
void order;
void widget;
void 0 as unknown as WidgetRenderInput;
void assertActions;
