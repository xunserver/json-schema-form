import { compileForm, createForm, defineForm } from "../src/index.js";
import {
  createSelector,
  fieldSelector,
  formSelector,
  getRuntimeSnapshot,
  observeRuntimeDiagnostics,
  subscribeRuntime,
  valueSelector,
  viewSelector,
} from "../src/runtime/index.js";
import type { RuntimeSelector } from "../src/runtime/index.js";

const { model } = compileForm(
  defineForm({
    schema: { type: "object", properties: { name: { type: "string" }, age: { type: "number" } } },
  }),
);
const form = createForm(model, { initialValues: { name: "Ada", age: 1 } });

const name: RuntimeSelector<unknown> = valueSelector("name");
const field = fieldSelector("name");
const view = viewSelector(model.ui.viewTree.id);
const aggregate = formSelector();
const composed = createSelector([name, field], (value, snapshot) => ({ value, snapshot }));

void getRuntimeSnapshot(form, composed);
void subscribeRuntime(form, aggregate, () => undefined);
void observeRuntimeDiagnostics(form, () => undefined);
void view;

type SelectorKeys = keyof RuntimeSelector<unknown>;
type ForbiddenSelectorKeys = Extract<
  SelectorKeys,
  "deps" | "project" | "dependencyKey" | "transactionManager" | "RuntimeNodeId"
>;
type AssertOpaque = ForbiddenSelectorKeys extends never ? true : never;
const opaque: AssertOpaque = true;
void opaque;

createSelector(
  // @ts-expect-error callers cannot forge selector dependency keys
  [{ deps: ["value:name"] }],
  (value) => value,
);

// @ts-expect-error Store writers are not part of the runtime barrel
import type { ValueStoreImpl } from "../src/runtime/index.js";

// @ts-expect-error Transaction Manager is not part of the runtime barrel
import type { TransactionManager } from "../src/runtime/index.js";

// @ts-expect-error RuntimeNodeId is not part of the runtime barrel
import type { RuntimeNodeId } from "../src/runtime/index.js";

declare const store: ValueStoreImpl;
declare const manager: TransactionManager;
declare const runtimeNodeId: RuntimeNodeId;
void store;
void manager;
void runtimeNodeId;
