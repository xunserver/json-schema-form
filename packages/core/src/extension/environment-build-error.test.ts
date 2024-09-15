import { describe, expect, test } from "vitest";
import type { Diagnostic } from "../diagnostic/index.js";
import { EnvironmentBuildError } from "./environment-build-error.js";

describe("EnvironmentBuildError", () => {
  test("carries frozen diagnostics and no partial environment", () => {
    const metadata = { registry: "widgets", key: "text" };
    const diagnostics: readonly Diagnostic[] = [
      {
        code: "plugin.registry-conflict",
        severity: "error",
        message: "conflict",
        source: "plugin",
        pluginId: "company",
        metadata,
      },
    ];

    const error = new EnvironmentBuildError(diagnostics);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EnvironmentBuildError");
    expect("environment" in error).toBe(false);
    expect(Object.isFrozen(error.diagnostics)).toBe(true);
    expect(Object.isFrozen(error.diagnostics[0])).toBe(true);
    expect(Object.isFrozen(error.diagnostics[0]?.metadata)).toBe(true);
    expect(() => {
      (error.diagnostics as Diagnostic[]).push(diagnostics[0]!);
    }).toThrow();
    expect(() => {
      (error.diagnostics[0]!.metadata as { key: string }).key = "other";
    }).toThrow();
    metadata.key = "mutated";
    expect(error.diagnostics[0]?.metadata?.key).toBe("text");
  });
});
