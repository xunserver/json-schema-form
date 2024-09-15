import { describe, expect, test } from "vitest";
import {
  formatModelPath,
  isValidModelPath,
  parseModelPath,
  toModelPath,
  type ModelPathSegment,
} from "./model-path.js";

const FIXTURES: readonly { readonly path: string; readonly segments: readonly ModelPathSegment[] }[] = [
  { path: "", segments: [] },
  { path: "name", segments: [{ kind: "property", name: "name" }] },
  {
    path: "products[].name",
    segments: [
      { kind: "property", name: "products" },
      { kind: "list" },
      { kind: "property", name: "name" },
    ],
  },
  {
    path: "coords[#0]",
    segments: [
      { kind: "property", name: "coords" },
      { kind: "tuple", index: 0 },
    ],
  },
  {
    path: "coords[#12]",
    segments: [
      { kind: "property", name: "coords" },
      { kind: "tuple", index: 12 },
    ],
  },
  {
    path: '["weird.prop"].nested',
    segments: [
      { kind: "property", name: "weird.prop" },
      { kind: "property", name: "nested" },
    ],
  },
  {
    path: 'address["with space"]',
    segments: [
      { kind: "property", name: "address" },
      { kind: "property", name: "with space" },
    ],
  },
  {
    path: '["123"]',
    segments: [{ kind: "property", name: "123" }],
  },
];

describe("ModelPath codec", () => {
  test("round-trips root, property, escaped, list, and tuple segments", () => {
    for (const fixture of FIXTURES) {
      expect(parseModelPath(fixture.path), fixture.path).toEqual(fixture.segments);
      expect(formatModelPath(fixture.segments)).toBe(fixture.path);
      expect(toModelPath(fixture.path)).toBe(fixture.path);
    }
  });

  test("rejects InstancePath-style numeric indexes", () => {
    for (const path of ["products[0]", "products[0].name", "items[12]", "a[01]"]) {
      expect(isValidModelPath(path), path).toBe(false);
      expect(parseModelPath(path), path).toBeUndefined();
    }
  });

  test("rejects malformed static paths", () => {
    for (const path of [".name", "name.", "name[]name", "[#]", "[#-1]", "[#01]", "[]["]) {
      expect(parseModelPath(path), path).toBeUndefined();
    }
  });
});
