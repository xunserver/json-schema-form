import { describe, expect, test } from "vitest";
import {
  cloneJsonValue,
  jsonEqual,
  JsonCloneError,
  reuseEqualBranches,
  setJsonPath,
} from "./json-value.js";

describe("JSON value snapshots", () => {
  test("clones nested objects and arrays and isolates later input mutation", () => {
    const input = { profile: { name: "Ada" }, tags: ["a"] };
    const snapshot = cloneJsonValue(input);
    input.profile.name = "Grace";
    input.tags.push("b");
    expect(snapshot).toEqual({ profile: { name: "Ada" }, tags: ["a"] });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen((snapshot as { profile: object }).profile)).toBe(true);
  });

  test("rejects mutation of the published snapshot", () => {
    const snapshot = cloneJsonValue({ name: "Ada" }) as { name: string };
    expect(() => {
      snapshot.name = "Grace";
    }).toThrow();
  });

  test("compares semantically equal nested values", () => {
    expect(jsonEqual({ a: 1, b: [true, null] }, { a: 1, b: [true, null] })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  test("shares unchanged branches across updates", () => {
    const current = cloneJsonValue({ name: "Ada", age: 1, nested: { city: "Paris" } });
    const updated = setJsonPath(current, [{ kind: "property", name: "name" }], "Grace", () => true);
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.value).toEqual({ name: "Grace", age: 1, nested: { city: "Paris" } });
    expect(Object.is((updated.value as { nested: object }).nested, (current as { nested: object }).nested)).toBe(
      true,
    );
  });

  test("reuses equal branches on root replacement", () => {
    const current = cloneJsonValue({ name: "Ada", profile: { city: "Paris" } });
    const next = reuseEqualBranches(current, cloneJsonValue({ name: "Grace", profile: { city: "Paris" } }));
    expect(Object.is((next as { profile: object }).profile, (current as { profile: object }).profile)).toBe(true);
  });

  test.each([
    ["function", { name: () => "Ada" }, "function"],
    ["symbol", { [Symbol("x")]: 1 }, "symbol"],
    ["accessor", Object.defineProperty({}, "name", { get: () => "Ada" }), "accessor-property"],
  ] as const)("rejects %s values", (_label, input, reason) => {
    try {
      cloneJsonValue(input);
      throw new Error("expected clone to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonCloneError);
      expect((error as JsonCloneError).reason).toBe(reason);
    }
  });

  test("rejects cycles", () => {
    const input: { self?: unknown } = {};
    input.self = input;
    try {
      cloneJsonValue(input);
      throw new Error("expected clone to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(JsonCloneError);
      expect((error as JsonCloneError).reason).toBe("cycle");
    }
  });
});
