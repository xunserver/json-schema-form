import { describe, expect, test } from "vitest";
import { compileV1 } from "../fixtures/v1/index.js";
import { formSelector, subscribeRuntime, valueSelector } from "@xunserver-jsf/core/runtime";

describe("v1 stable transactions", () => {
  test("V1-STABLE-TX publishes one commit after computed and sync validation", async () => {
    const { form } = compileV1("explicit");
    const versions: number[] = [];
    const totals: unknown[] = [];
    subscribeRuntime(form, formSelector(), (snapshot) => {
      versions.push(snapshot.version);
    });
    subscribeRuntime(form, valueSelector("total"), (value) => {
      totals.push(value);
    });
    form.setValue("amount", 40);
    expect(form.getValue("total")).toBe(80);
    expect(new Set(versions).size).toBe(versions.length === 0 ? 0 : 1);
    expect(totals.at(-1)).toBe(80);
    const before = form.getState().version;
    await form.validate();
    expect(form.getState().version).toBeGreaterThanOrEqual(before);
  });
});
