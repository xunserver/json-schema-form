import {
  arrayOrderSelector,
  createSelector,
  formSelector,
  getRuntimeSnapshot,
  observeRuntimeDiagnostics,
  subscribeRuntime,
  valueSelector,
} from "@form/core/runtime";
import type { ArrayIdentityResolver } from "@form/core/runtime";
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
export const resolver: ArrayIdentityResolver = () => undefined;

void snapshot;
void unsubscribe;
void composed;
void stopDiagnostics;
void order;
void resolver;
