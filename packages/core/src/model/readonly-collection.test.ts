import { describe, expect, test } from "vitest";
import { createReadonlyKeyedCollection } from "./readonly-collection.js";

describe("ReadonlyKeyedCollection", () => {
  test("iterates in insertion order and has no mutation methods", () => {
    const collection = createReadonlyKeyedCollection([
      ["name", 1],
      ["age", 2],
    ] as const);

    expect(collection.size).toBe(2);
    expect(collection.get("name")).toBe(1);
    expect([...collection.keys()]).toEqual(["name", "age"]);
    expect([...collection.values()]).toEqual([1, 2]);
    expect("set" in collection).toBe(false);
    expect("delete" in collection).toBe(false);
    expect("clear" in collection).toBe(false);
    expect(typeof (collection as { set?: unknown }).set).toBe("undefined");
  });

  test("freezes contents so casts cannot mutate published entries", () => {
    const value = Object.freeze({ label: "Name" });
    const collection = createReadonlyKeyedCollection([["name", value]] as const);
    expect(Object.isFrozen(collection)).toBe(true);
    expect(() => {
      (value as { label: string }).label = "Other";
    }).toThrow();
    expect(collection.get("name")?.label).toBe("Name");
  });
});
