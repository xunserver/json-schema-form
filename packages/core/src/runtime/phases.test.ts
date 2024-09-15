import { describe, expect, test } from "vitest";
import { createFormWithTestHooks } from "./test-harness.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { formSelector, subscribeRuntime } from "./index.js";
import { compilePersonModel, expectRuntimeError } from "./runtime.test-utils.js";

describe("runtime phases", () => {
  test("runs phases in a fixed order and hides the new version until commit", () => {
    const order: string[] = [];
    const versions: number[] = [];
    const form = createFormWithTestHooks(
      compilePersonModel(),
      { initialValues: { name: "Ada" } },
      {
        phases: {
          activation: (context) => {
            order.push("activation");
            versions.push(context.committedVersion);
          },
          rule: (context) => {
            order.push("rule");
            versions.push(context.committedVersion);
          },
          syncValidation: (context) => {
            order.push("syncValidation");
            versions.push(context.committedVersion);
          },
          asyncSchedule: (context) => {
            order.push("asyncSchedule");
            versions.push(context.committedVersion);
          },
        },
      },
    );
    form.setValue("name", "Grace");
    expect(order).toEqual(["activation", "rule", "syncValidation", "asyncSchedule"]);
    expect(versions).toEqual([0, 0, 0, 0]);
    expect(form.getState().version).toBe(1);
  });

  test("keeps phase-enqueued commands in the same transaction", () => {
    const form = createFormWithTestHooks(
      compilePersonModel(),
      { initialValues: { name: "Ada", age: 1 } },
      {
        phases: {
          rule: (context) => {
            if (context.getValue("name") === "Grace") {
              context.enqueue({ type: "setValue", path: "age", value: 42 });
            }
          },
        },
      },
    );
    const pairs: string[] = [];
    subscribeRuntime(form, formSelector(), (snapshot) => {
      const values = snapshot.values as { name?: string; age?: number };
      pairs.push(`${values.name}:${values.age}:${snapshot.version}`);
    });
    form.setValue("name", "Grace");
    expect(form.getValue("name")).toBe("Grace");
    expect(form.getValue("age")).toBe(42);
    expect(form.getState().version).toBe(1);
    expect(pairs).toEqual(["Grace:42:1"]);
  });

  test("skips phases on no-op commands", () => {
    let ran = 0;
    const form = createFormWithTestHooks(
      compilePersonModel(),
      { initialValues: { name: "Ada" } },
      {
        phases: {
          activation: () => {
            ran += 1;
          },
        },
      },
    );
    form.setValue("name", "Ada");
    expect(ran).toBe(0);
    expect(form.getState().version).toBe(0);
  });

  test("does not give phases a store writer", () => {
    const form = createFormWithTestHooks(
      compilePersonModel(),
      { initialValues: { name: "Ada" } },
      {
        phases: {
          activation: (context) => {
            expect(context).not.toHaveProperty("values");
            expect(context).not.toHaveProperty("transaction");
            expect(typeof context.enqueue).toBe("function");
          },
        },
      },
    );
    form.setValue("name", "Grace");
  });

  test("schedules async work only after commit", () => {
    const events: string[] = [];
    const form = createFormWithTestHooks(
      compilePersonModel(),
      { initialValues: { name: "Ada" } },
      {
        phases: {
          syncValidation: () => {
            events.push(`sync:${0}`);
          },
          asyncSchedule: () => {
            events.push("async");
          },
        },
      },
    );
    subscribeRuntime(form, formSelector(), (snapshot) => {
      events.push(`publish:${snapshot.version}`);
    });
    form.setValue("name", "Grace");
    expect(events).toEqual(["sync:0", "publish:1", "async"]);
  });

  test("non-converging phases roll back with a stable diagnostic", () => {
    let n = 0;
    const form = createFormWithTestHooks(
      compilePersonModel(),
      { initialValues: { name: "Ada" } },
      {
        commandLimit: 8,
        iterationLimit: 8,
        phases: {
          rule: (context) => {
            n += 1;
            context.enqueue({ type: "setValue", path: "name", value: `v${n}` });
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
    expect(error.diagnostics.map((item) => item.code)).toEqual([RUNTIME_DIAGNOSTIC_CODES.TRANSACTION_LIMIT]);
    expect(form.getValues()).toBe(before);
    expect(form.getState().version).toBe(0);
    expect(notified).toBe(0);
    expect(error).not.toHaveProperty("cause");
  });

  test("normalizes thrown phases and multiple diagnostics without leaking exceptions", () => {
    const form = createFormWithTestHooks(
      compilePersonModel(),
      { initialValues: { name: "Ada" } },
      {
        phases: {
          activation: () => {
            throw new Error("first");
          },
        },
      },
    );
    const error = expectRuntimeError(() => form.setValue("name", "Grace"));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.PHASE_FAILED);
    expect(error.diagnostics[0]?.metadata?.reason).toBe("first");
    expect(JSON.stringify(error.diagnostics)).not.toMatch(/Error: first/);
    expect(form.getState().version).toBe(0);
  });
});
