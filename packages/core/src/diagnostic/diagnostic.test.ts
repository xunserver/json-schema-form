import { describe, expect, test } from "vitest";
import type { Diagnostic } from "./index.js";

const minimal: Diagnostic = {
  code: "schema.unsupported",
  severity: "warning",
  message: "Keyword is not used for UI generation",
  source: "schema",
};

describe("Diagnostic", () => {
  test("exposes required fields without a producer-specific subtype", () => {
    expect(minimal.code).toBe("schema.unsupported");
    expect(minimal.severity).toBe("warning");
    expect(minimal.message).toBe("Keyword is not used for UI generation");
    expect(minimal.source).toBe("schema");
    expect("schemaPath" in minimal).toBe(false);
    expect("modelPath" in minimal).toBe(false);
  });

  test("preserves optional typed context as readonly data", () => {
    const diagnostic: Diagnostic = {
      ...minimal,
      pluginId: "core.compiler",
      metadata: { keyword: "properties" },
    };

    expect(diagnostic.pluginId).toBe("core.compiler");
    expect(diagnostic.metadata).toEqual({ keyword: "properties" });
    expect(Object.isFrozen(Object.freeze(diagnostic.metadata))).toBe(true);
  });
});
