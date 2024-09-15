import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "../index.js";
import { createFormEnvironment, definePlugin } from "../extension/index.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import {
  createSelector,
  fieldSelector,
  formSelector,
  getRuntimeSnapshot,
  observeRuntimeDiagnostics,
  subscribeRuntime,
  valueSelector,
  viewSelector,
} from "./index.js";
import { compileDuplicateFieldModel, compilePersonModel } from "./runtime.test-utils.js";
import type { FieldView } from "../model/ui.js";

describe("selectors", () => {
  test("built-in selectors compose, memoize, and stay readonly", () => {
    const form = createForm(compilePersonModel(), { initialValues: { name: "Ada", age: 1 } });
    const nameAndAge = createSelector([valueSelector("name"), valueSelector("age")], (name, age) => ({ name, age }));
    const first = getRuntimeSnapshot(form, nameAndAge);
    expect(first).toEqual({ name: "Ada", age: 1 });
    expect(getRuntimeSnapshot(form, nameAndAge)).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    form.setValue("age", 1);
    expect(getRuntimeSnapshot(form, nameAndAge)).toBe(first);
  });

  test("only re-evaluates selectors whose dependencies intersect the change set", () => {
    const form = createForm(compilePersonModel(), { initialValues: { name: "Ada", age: 1 } });
    let nameRuns = 0;
    let ageRuns = 0;
    let formRuns = 0;
    const name = createSelector([valueSelector("name")], (value) => {
      nameRuns += 1;
      return value;
    });
    const age = createSelector([valueSelector("age")], (value) => {
      ageRuns += 1;
      return value;
    });
    const aggregate = createSelector([formSelector()], (snapshot) => {
      formRuns += 1;
      return snapshot.version;
    });
    subscribeRuntime(form, name, () => undefined);
    subscribeRuntime(form, age, () => undefined);
    subscribeRuntime(form, aggregate, () => undefined);
    nameRuns = 0;
    ageRuns = 0;
    formRuns = 0;
    form.setValue("name", "Grace");
    expect(nameRuns).toBe(1);
    expect(ageRuns).toBe(0);
    expect(formRuns).toBe(1);
  });

  test("does not notify when projector results are Object.is equal", () => {
    const form = createForm(compilePersonModel(), { initialValues: { name: "Ada", age: 1 } });
    const constant = createSelector([valueSelector("name")], () => 7);
    let notified = 0;
    subscribeRuntime(form, constant, () => {
      notified += 1;
    });
    form.setValue("name", "Grace");
    expect(notified).toBe(0);
    expect(getRuntimeSnapshot(form, constant)).toBe(7);
  });

  test("publishes in registration order and unsubscribes idempotently", () => {
    const form = createForm(compilePersonModel(), { initialValues: { name: "Ada" } });
    const order: string[] = [];
    const unsubscribe = subscribeRuntime(form, valueSelector("name"), () => {
      order.push("first");
    });
    subscribeRuntime(form, valueSelector("name"), () => {
      order.push("second");
    });
    form.setValue("name", "Grace");
    expect(order).toEqual(["first", "second"]);
    unsubscribe();
    unsubscribe();
    form.setValue("name", "Linus");
    expect(order).toEqual(["first", "second", "second"]);
  });

  test("does not notify a subscriber registered during the current publish", () => {
    const form = createForm(compilePersonModel(), { initialValues: { name: "Ada" } });
    const order: string[] = [];
    let added = false;
    subscribeRuntime(form, valueSelector("name"), () => {
      order.push("first");
      if (!added) {
        added = true;
        subscribeRuntime(form, valueSelector("name"), () => {
          order.push("late");
        });
      }
    });
    form.setValue("name", "Grace");
    expect(order).toEqual(["first"]);
    form.setValue("name", "Linus");
    expect(order).toEqual(["first", "first", "late"]);
  });

  test("does not share selector cache or listeners across instances", () => {
    const model = compilePersonModel();
    const left = createForm(model, { initialValues: { name: "Ada" } });
    const right = createForm(model, { initialValues: { name: "Ada" } });
    const selector = valueSelector("name");
    const seen: unknown[] = [];
    subscribeRuntime(right, selector, (value) => {
      seen.push(value);
    });
    left.setValue("name", "Grace");
    expect(getRuntimeSnapshot(right, selector)).toBe("Ada");
    expect(seen).toEqual([]);
  });

  test("queues subscriber mutations as the next FIFO transaction", () => {
    const form = createForm(compilePersonModel(), { initialValues: { name: "Ada" } });
    const versions: number[] = [];
    subscribeRuntime(form, formSelector(), (snapshot) => {
      versions.push(snapshot.version);
      if (snapshot.version === 1) {
        form.setValue("name", "Linus");
      }
    });
    form.setValue("name", "Grace");
    expect(versions).toEqual([1, 2]);
    expect(form.getValue("name")).toBe("Linus");
    expect(form.getState().version).toBe(2);
  });

  test("isolates subscriber and instrumentation exceptions", () => {
    const plugin = definePlugin({
      id: "probe",
      dependsOn: ["core"],
      contributes: {
        instrumentation: {
          probe: {
            name: "probe",
            observe: () => {
              throw new Error("instrumentation");
            },
          },
        },
      },
    });
    const environment = createFormEnvironment({ plugins: [plugin] });
    const model = compileForm(
      defineForm({
        schema: { type: "object", properties: { name: { type: "string" } } },
      }),
      { environment },
    ).model;
    const form = createForm(model, { environment, initialValues: { name: "Ada" } });
    const seen: unknown[] = [];
    const diagnostics: string[] = [];
    subscribeRuntime(form, valueSelector("name"), () => {
      throw new Error("first");
    });
    subscribeRuntime(form, valueSelector("name"), (value) => {
      seen.push(value);
    });
    observeRuntimeDiagnostics(form, (event) => {
      diagnostics.push(...event.diagnostics.map((item) => item.code));
      expect(event).not.toHaveProperty("transaction");
      expect(event).not.toHaveProperty("store");
    });
    form.setValue("name", "Grace");
    expect(form.getValue("name")).toBe("Grace");
    expect(form.getState().version).toBe(1);
    expect(seen).toEqual(["Grace"]);
    expect(diagnostics).toContain(RUNTIME_DIAGNOSTIC_CODES.SUBSCRIBER_THREW);
    expect(diagnostics).toContain(RUNTIME_DIAGNOSTIC_CODES.INSTRUMENTATION_THREW);
  });

  test("diagnostic observers do not recurse when they throw", () => {
    const form = createForm(compilePersonModel(), { initialValues: { name: "Ada" } });
    let calls = 0;
    observeRuntimeDiagnostics(form, () => {
      calls += 1;
      throw new Error("observer");
    });
    subscribeRuntime(form, valueSelector("name"), () => {
      throw new Error("subscriber");
    });
    form.setValue("name", "Grace");
    expect(calls).toBe(1);
    expect(form.getState().version).toBe(1);
  });

  test("view selectors track focus without touching sibling views", () => {
    const model = compileDuplicateFieldModel();
    const form = createForm(model, { initialValues: { name: "Ada" } });
    const views = collectFieldViews(model.ui.viewTree).filter((view) => view.fieldPath === "name");
    let otherRuns = 0;
    const other = createSelector([viewSelector(views[1]!.id)], (snapshot) => {
      otherRuns += 1;
      return snapshot.focused;
    });
    subscribeRuntime(form, viewSelector(views[0]!.id), () => undefined);
    subscribeRuntime(form, other, () => undefined);
    otherRuns = 0;
    form.focus(views[0]!.id);
    expect(getRuntimeSnapshot(form, viewSelector(views[0]!.id)).focused).toBe(true);
    expect(otherRuns).toBe(0);
  });
});

function collectFieldViews(node: unknown): FieldView[] {
  if (typeof node !== "object" || node === null) {
    return [];
  }
  const record = node as { kind?: string; children?: readonly unknown[]; itemLayout?: readonly unknown[] } & Partial<FieldView>;
  const views: FieldView[] = [];
  if (record.kind === "field" && record.id !== undefined && record.fieldPath !== undefined) {
    views.push(record as FieldView);
  }
  for (const child of record.children ?? []) {
    views.push(...collectFieldViews(child));
  }
  for (const child of record.itemLayout ?? []) {
    views.push(...collectFieldViews(child));
  }
  return views;
}
