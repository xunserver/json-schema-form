import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "../../src/index.js";
import { createSelector, subscribeRuntime, valueSelector } from "./index.js";

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
});
