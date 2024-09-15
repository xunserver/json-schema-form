import {
  arrayOrderSelector,
  createSelector,
  currentBindingSelector,
  effectiveStateSelector,
  formSelector,
  getRenderScope,
  getRuntimeSnapshot,
  observeRuntimeDiagnostics,
  subscribeRuntime,
  valueSelector,
} from "@form/core/runtime";
import type { ArrayIdentityResolver, InstanceBinding, RenderScope } from "@form/core/runtime";
import { compileForm, createForm, defineForm } from "@form/core";

const form = createForm(
  compileForm(
    defineForm({
      schema: { type: "object", properties: { title: { type: "string" } } },
    }),
  ).model,
  { initialValues: { title: "Ada" } },
);

export const snapshot = getRuntimeSnapshot(form, valueSelector("title"));
export const unsubscribe = subscribeRuntime(form, formSelector(), () => undefined);
export const composed = createSelector([valueSelector("title")], (title) => title);
export const stopDiagnostics = observeRuntimeDiagnostics(form, () => undefined);
export const order = arrayOrderSelector("title");
export const effective = effectiveStateSelector("title");
export const resolver: ArrayIdentityResolver = () => undefined;
export const scope: RenderScope = getRenderScope(form);
export const binding: InstanceBinding = scope.binding;
void currentBindingSelector("title");

void snapshot;
void unsubscribe;
void composed;
void stopDiagnostics;
void order;
void effective;
void resolver;
