import { describe, expect, test } from "vitest";
import { CompileError } from "./compile-error.js";
import type { Diagnostic } from "../diagnostic/index.js";

describe("CompileError", () => {
  test("carries structured diagnostics for a blocking failure", () => {
    const diagnostics: readonly Diagnostic[] = [
      {
        code: "compiler.invalid-schema",
        severity: "error",
        message: "Schema could not be parsed",
        source: "compiler",
      },
    ];

    const error = new CompileError(diagnostics);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CompileError");
    expect(error.diagnostics).toEqual(diagnostics);
    expect(Object.isFrozen(Object.freeze(error.diagnostics))).toBe(true);
  });
});
