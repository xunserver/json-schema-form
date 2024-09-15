import { describe, expect, test } from "vitest";
import { cloneAndFreezeOwned } from "./clone-freeze.js";

describe("cloneAndFreezeOwned", () => {
  test("deep-clones and freezes nested plain objects and arrays", () => {
    const source = {
      name: "text",
      nested: { flag: true },
      items: [{ value: 1 }],
    };

    const result = cloneAndFreezeOwned(source);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).not.toBe(source);
    expect(result.value.nested).not.toBe(source.nested);
    expect(result.value.items).not.toBe(source.items);
    expect(result.value.items[0]).not.toBe(source.items[0]);
    expect(result.value).toEqual(source);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.nested)).toBe(true);
    expect(Object.isFrozen(result.value.items)).toBe(true);
    expect(Object.isFrozen(result.value.items[0])).toBe(true);

    source.nested.flag = false;
    expect(result.value.nested.flag).toBe(true);
  });

  test("preserves function identity while freezing surrounding descriptors", () => {
    const observe = (): void => undefined;
    const source = { name: "log", observe };
    const result = cloneAndFreezeOwned(source);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.observe).toBe(observe);
    expect(Object.isFrozen(result.value)).toBe(true);
  });

  test("handles circular references with a visited set", () => {
    const left: { name: string; other?: unknown } = { name: "left" };
    const right: { name: string; other?: unknown } = { name: "right", other: left };
    left.other = right;

    const result = cloneAndFreezeOwned(left);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).not.toBe(left);
    expect((result.value.other as { other: unknown }).other).toBe(result.value);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.other as object)).toBe(true);
  });

  test("rejects class instances, maps, and accessor descriptors", () => {
    class Descriptor {
      name = "text";
    }

    expect(cloneAndFreezeOwned(new Descriptor())).toEqual({
      ok: false,
      reason: "non-plain-object",
    });
    expect(cloneAndFreezeOwned(new Map())).toEqual({
      ok: false,
      reason: "non-plain-object",
    });

    const withGetter = {};
    Object.defineProperty(withGetter, "name", {
      get() {
        return "text";
      },
    });
    expect(cloneAndFreezeOwned(withGetter)).toEqual({
      ok: false,
      reason: "accessor-property",
    });
  });
});
