import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "../../src/index.js";
import { createSelector, fieldSelector, subscribeRuntime, valueSelector } from "./index.js";
import { peekFormRuntime } from "./test-harness.js";

describe("selector invalidation scaling", () => {
  test("a single-field update does not evaluate every field selector", () => {
    const properties: Record<string, { type: "string" }> = {};
    const initialValues: Record<string, string> = {};
    for (let index = 0; index < 80; index += 1) {
      const key = `field${index}`;
      properties[key] = { type: "string" };
      initialValues[key] = "x";
    }
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties },
        }),
      ).model,
      { initialValues },
    );
    const runs = new Map<string, number>();
    for (const key of Object.keys(properties)) {
      const selector = createSelector([valueSelector(key)], (value) => {
        runs.set(key, (runs.get(key) ?? 0) + 1);
        return value;
      });
      subscribeRuntime(form, selector, () => undefined);
    }
    for (const key of Object.keys(properties)) {
      runs.set(key, 0);
    }
    form.setValue("field0", "y");
    expect(runs.get("field0")).toBe(1);
    expect(runs.get("field1")).toBe(0);
    expect(runs.get("field79")).toBe(0);
    const evaluated = [...runs.values()].filter((count) => count > 0).length;
    expect(evaluated).toBe(1);
  });

  test("root replacement traversal scales with changed nodes rather than every field subscriber", () => {
    const nested = { a: { b: { c: { d: { e: "keep" } } } }, sibling: "same" };
    const form = createForm(
      compileForm(
        defineForm({
          schema: {
            type: "object",
            properties: {
              a: {
                type: "object",
                properties: {
                  b: {
                    type: "object",
                    properties: {
                      c: {
                        type: "object",
                        properties: {
                          d: {
                            type: "object",
                            properties: { e: { type: "string" } },
                          },
                        },
                      },
                    },
                  },
                },
              },
              sibling: { type: "string" },
            },
          },
        }),
      ).model,
      { initialValues: nested },
    );
    let deepRuns = 0;
    let siblingRuns = 0;
    subscribeRuntime(
      form,
      createSelector([valueSelector("a.b.c.d.e")], (value) => {
        deepRuns += 1;
        return value;
      }),
      () => undefined,
    );
    subscribeRuntime(
      form,
      createSelector([valueSelector("sibling")], (value) => {
        siblingRuns += 1;
        return value;
      }),
      () => undefined,
    );
    deepRuns = 0;
    siblingRuns = 0;
    form.setValues({ a: { b: { c: { d: { e: "next" } } } }, sibling: "same" });
    expect(deepRuns).toBe(1);
    expect(siblingRuns).toBe(0);
  });

  test("rule scheduling scales with affected bindings rather than the whole graph", () => {
    const properties: Record<string, { type: "number" }> = { source: { type: "number" } };
    const rules: { kind: "computed"; target: string; action: { value: { field: string } | number } }[] = [];
    const initialValues: Record<string, number> = { source: 1 };
    for (let index = 0; index < 40; index += 1) {
      const key = `field${index}`;
      properties[key] = { type: "number" };
      initialValues[key] = 0;
      rules.push({
        kind: "computed",
        target: key,
        action: { value: index === 0 ? { field: "source" } : index },
      });
    }
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties },
          rules,
        }),
      ).model,
      { initialValues },
    );
    const runtime = peekFormRuntime(form);
    runtime.engine.stats.evaluatedRules = 0;
    runtime.engine.stats.scheduledRules = 0;
    let otherRuns = 0;
    subscribeRuntime(form, valueSelector("field39"), () => {
      otherRuns += 1;
    });
    form.setValue("source", 2);
    expect(form.getValue("field0")).toBe(2);
    expect(form.getValue("field39")).toBe(39);
    expect(otherRuns).toBe(0);
    expect(runtime.engine.stats.evaluatedRules).toBeLessThan(8);
    expect(runtime.engine.stats.scheduledRules).toBeLessThan(8);
  });

  test("a long computed DAG and array item update do not scan unrelated bindings", () => {
    const properties: Record<string, { type: "number" }> = { n0: { type: "number" } };
    const rules: { kind: "computed"; target: string; action: { value: { field: string } } }[] = [];
    const initialValues: Record<string, number> = { n0: 1 };
    for (let index = 1; index <= 12; index += 1) {
      const key = `n${index}`;
      properties[key] = { type: "number" };
      initialValues[key] = 0;
      rules.push({ kind: "computed", target: key, action: { value: { field: `n${index - 1}` } } });
    }
    const dag = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties },
          rules,
        }),
      ).model,
      { initialValues },
    );
    const dagRuntime = peekFormRuntime(dag);
    dagRuntime.engine.stats.evaluatedRules = 0;
    dag.setValue("n0", 2);
    expect(dag.getValue("n12")).toBe(2);
    expect(dagRuntime.engine.stats.evaluatedRules).toBe(12);

    const list = createForm(
      compileForm(
        defineForm({
          schema: {
            type: "object",
            properties: {
              products: {
                type: "array",
                items: { type: "object", properties: { quantity: { type: "number" }, total: { type: "number" } } },
              },
            },
          },
          rules: [{ kind: "computed", target: "products[].total", action: { value: { field: "products[].quantity" } } }],
        }),
      ).model,
      {
        initialValues: {
          products: Array.from({ length: 20 }, (_, index) => ({ quantity: index + 1, total: 0 })),
        },
      },
    );
    const listRuntime = peekFormRuntime(list);
    listRuntime.engine.stats.evaluatedRules = 0;
    let other = 0;
    subscribeRuntime(list, valueSelector("products[19].total"), () => {
      other += 1;
    });
    list.setValue("products[0].quantity", 99);
    expect(list.getValue("products[0].total")).toBe(99);
    expect(list.getValue("products[19].total")).toBe(20);
    expect(other).toBe(0);
    expect(listRuntime.engine.stats.evaluatedRules).toBeLessThan(4);
  });
});

describe("validation selector scaling", () => {
  test("server error replacement does not evaluate unrelated field selectors", () => {
    const properties: Record<string, { type: "string" }> = {};
    const initialValues: Record<string, string> = {};
    for (let index = 0; index < 40; index += 1) {
      const key = `field${index}`;
      properties[key] = { type: "string" };
      initialValues[key] = "x";
    }
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties },
        }),
      ).model,
      { initialValues },
    );
    const runs = new Map<string, number>();
    for (const key of Object.keys(properties)) {
      subscribeRuntime(form, fieldSelector(key), () => {
        runs.set(key, (runs.get(key) ?? 0) + 1);
      });
    }
    for (const key of Object.keys(properties)) {
      runs.set(key, 0);
    }
    form.applyErrors([{ code: "remote", instancePath: "field0" }]);
    expect(runs.get("field0")).toBe(1);
    expect(runs.get("field1")).toBe(0);
    expect(runs.get("field39")).toBe(0);
  });
});

