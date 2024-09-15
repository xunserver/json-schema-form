import { describe, expect, test } from "vitest";
import { createForm } from "../index.js";
import type { FieldView } from "../model/ui.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { formSelector, getRuntimeSnapshot, subscribeRuntime, valueSelector, viewSelector } from "./index.js";
import { createFormWithTestHooks } from "./test-harness.js";
import {
  compileDuplicateFieldModel,
  compilePersonModel,
  expectRuntimeError,
} from "./runtime.test-utils.js";

describe("touch, focus, and reset", () => {
  test("shares touched across duplicate FieldViews and isolates focused by ViewNodeId", () => {
    const model = compileDuplicateFieldModel();
    const form = createForm(model, { initialValues: { name: "Ada" } });
    const views = collectFieldViews(model.ui.viewTree).filter((view) => view.fieldPath === "name");
    expect(views.length).toBeGreaterThanOrEqual(2);
    form.touch("name");
    form.focus(views[0]!.id);
    expect(form.getField("name").getState().touched).toBe(true);
    expect(getRuntimeSnapshot(form, viewSelector(views[0]!.id)).focused).toBe(true);
    expect(getRuntimeSnapshot(form, viewSelector(views[1]!.id)).focused).toBe(false);
    const unknownField = expectRuntimeError(() => form.touch("missing"));
    expect(unknownField.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH);
    const unknownView = expectRuntimeError(() => form.focus("view:missing" as never));
    expect(unknownView.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_VIEW);
  });

  test("reset restores values and source-state defaults in one commit", () => {
    const model = compileDuplicateFieldModel();
    const form = createForm(model, { initialValues: { name: "Ada", age: 1 } });
    const view = collectFieldViews(model.ui.viewTree)[0];
    const versions: number[] = [];
    subscribeRuntime(form, formSelector(), (snapshot) => {
      versions.push(snapshot.version);
    });
    form.setValue("name", "Grace");
    form.touch("name");
    if (view !== undefined) {
      form.focus(view.id);
    }
    form.reset();
    expect(form.getValue("name")).toBe("Ada");
    expect(form.getField("name").getState().touched).toBe(false);
    if (view !== undefined) {
      expect(getRuntimeSnapshot(form, viewSelector(view.id)).focused).toBe(false);
    }
    expect(form.getState().version).toBe(4);
    form.reset();
    expect(form.getState().version).toBe(4);
    expect(versions.at(-1)).toBe(4);
  });

  test("reset exposes a same-transaction reset signal to later namespaces", () => {
    const signals: boolean[] = [];
    const form = createFormWithTestHooks(
      compilePersonModel(),
      { initialValues: { name: "Ada" } },
      {
        phases: {
          activation: (context) => {
            signals.push(context.changeSet.reset);
          },
        },
      },
    );
    form.setValue("name", "Grace");
    form.reset();
    expect(signals).toEqual([false, true]);
  });
});

describe("effective no-op", () => {
  test.each([
    ["same primitive", (form: ReturnType<typeof createForm>) => form.setValue("name", "Ada")],
    ["same object", (form: ReturnType<typeof createForm>) => form.setValue("profile", { firstName: "Ada" })],
    ["same root", (form: ReturnType<typeof createForm>) => form.setValues({ name: "Ada", profile: { firstName: "Ada" } })],
  ] as const)("%s does not commit", (_label, run) => {
    const form = createForm(compilePersonModel(), {
      initialValues: { name: "Ada", profile: { firstName: "Ada" } },
    });
    const snapshot = form.getState();
    let notified = 0;
    subscribeRuntime(form, formSelector(), () => {
      notified += 1;
    });
    run(form);
    expect(form.getState()).toBe(snapshot);
    expect(form.getState().version).toBe(0);
    expect(notified).toBe(0);
  });

  test("repeat touch and focus are no-ops", () => {
    const model = compileDuplicateFieldModel();
    const form = createForm(model, { initialValues: { name: "Ada" } });
    const view = collectFieldViews(model.ui.viewTree)[0];
    form.touch("name");
    const version = form.getState().version;
    form.touch("name");
    expect(form.getState().version).toBe(version);
    if (view !== undefined) {
      form.focus(view.id);
      const afterFocus = form.getState().version;
      form.focus(view.id);
      expect(form.getState().version).toBe(afterFocus);
    }
  });

  test("in-transaction compensating commands skip publish", () => {
    const form = createFormWithTestHooks(
      compilePersonModel(),
      { initialValues: { name: "Ada" } },
      {
        phases: {
          rule: (context) => {
            context.enqueue({ type: "setValue", path: "name", value: "Ada" });
          },
        },
      },
    );
    const snapshot = form.getState();
    let notified = 0;
    subscribeRuntime(form, valueSelector("name"), () => {
      notified += 1;
    });
    form.setValue("name", "Grace");
    expect(form.getValue("name")).toBe("Ada");
    expect(form.getState()).toBe(snapshot);
    expect(notified).toBe(0);
  });
});

describe("transaction rollback", () => {
  test("phase failure keeps committed state and does not publish", () => {
    const form = createFormWithTestHooks(
      compilePersonModel(),
      { initialValues: { name: "Ada" } },
      {
        phases: {
          syncValidation: () => {
            throw new Error("boom");
          },
        },
      },
    );
    const before = form.getValues();
    let notified = 0;
    subscribeRuntime(form, formSelector(), () => {
      notified += 1;
    });
    const error = expectRuntimeError(() => form.setValue("name", "Grace"));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.PHASE_FAILED);
    expect(error.diagnostics[0]?.metadata).not.toHaveProperty("exception");
    expect(form.getValues()).toBe(before);
    expect(form.getState().version).toBe(0);
    expect(notified).toBe(0);
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
