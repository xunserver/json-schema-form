import { describe, expect, test } from "vitest";
import {
  formatInstancePath,
  isValidInstancePath,
  parseInstancePath,
  toInstancePath,
  type InstancePathSegment,
} from "../../model/path/instance-path.js";
import { bindInstancePath } from "../dependency/binding.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import { compilePersonModel } from "../runtime.test-utils.js";

const FIXTURES: readonly { readonly path: string; readonly segments: readonly InstancePathSegment[] }[] = [
  { path: "", segments: [] },
  { path: "name", segments: [{ kind: "property", name: "name" }] },
  {
    path: "profile.firstName",
    segments: [
      { kind: "property", name: "profile" },
      { kind: "property", name: "firstName" },
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
    path: "tags[0]",
    segments: [
      { kind: "property", name: "tags" },
      { kind: "index", index: 0 },
    ],
  },
];

describe("InstancePath codec", () => {
  test("round-trips root, property, escaped, and index segments", () => {
    for (const fixture of FIXTURES) {
      expect(parseInstancePath(fixture.path), fixture.path).toEqual(fixture.segments);
      expect(formatInstancePath(fixture.segments)).toBe(fixture.path);
      expect(toInstancePath(fixture.path)).toBe(fixture.path);
    }
  });

  test("rejects invalid paths", () => {
    for (const path of [".name", "name.", "name[]", "tags[01]", "products[].name", "coords[#0]"]) {
      expect(isValidInstancePath(path), path).toBe(false);
    }
  });

  test("binds root, escaped-capable object properties, and missing optional containers", () => {
    const model = compilePersonModel();
    expect(bindInstancePath(model, "").ok).toBe(true);
    expect(bindInstancePath(model, "profile.firstName").ok).toBe(true);
    const missing = bindInstancePath(model, "profile.firstName");
    expect(missing.ok).toBe(true);
  });

  test("binds compiled array item templates without creating values", () => {
    const model = compilePersonModel();
    const result = bindInstancePath(model, "tags[0]");
    expect(result.ok).toBe(true);
    const missing = bindInstancePath(model, "tags[3].oops");
    expect(missing.ok).toBe(false);
    if (missing.ok) {
      return;
    }
    expect(missing.failure.code).toBe(RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH);
    expect(model.data.nodes.has("tags[3]" as never)).toBe(false);
  });

  test("reports unknown and invalid paths", () => {
    const model = compilePersonModel();
    const unknown = bindInstancePath(model, "missing");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.failure.code).toBe(RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH);
    }
    const invalid = bindInstancePath(model, ".bad");
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.failure.code).toBe(RUNTIME_DIAGNOSTIC_CODES.INVALID_PATH);
    }
  });
});
