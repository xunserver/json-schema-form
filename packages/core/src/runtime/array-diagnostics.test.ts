import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "../index.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { sortRuntimeDiagnostics, runtimeDiagnostic } from "./diagnostics.js";
import { expectRuntimeError } from "./runtime.test-utils.js";

const CASES = [
  {
    name: "invalid path",
    run: (form: ReturnType<typeof createForm>) => form.getValue(".bad"),
    code: RUNTIME_DIAGNOSTIC_CODES.INVALID_PATH,
  },
  {
    name: "unknown path",
    run: (form: ReturnType<typeof createForm>) => form.getValue("missing"),
    code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH,
  },
  {
    name: "non-array",
    run: (form: ReturnType<typeof createForm>) => form.array("name"),
    code: RUNTIME_DIAGNOSTIC_CODES.NON_ARRAY_PATH,
  },
  {
    name: "out of range",
    run: (form: ReturnType<typeof createForm>) => form.array("tags").item(4),
    code: RUNTIME_DIAGNOSTIC_CODES.ARRAY_INDEX_OUT_OF_RANGE,
  },
] as const;

describe("array runtime diagnostics", () => {
  test.each(CASES)("returns stable $name code and frozen metadata", ({ run, code }) => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
            },
          },
        }),
      ).model,
      { initialValues: { name: "Ada", tags: ["a"] } },
    );
    const error = expectRuntimeError(() => run(form));
    expect(error.diagnostics[0]?.code).toBe(code);
    expect(error.diagnostics[0]?.source).toBe("runtime");
    expect(Object.isFrozen(error.diagnostics[0]?.metadata ?? {})).toBe(true);
    expect(JSON.stringify(error.diagnostics)).not.toMatch(/RuntimeNodeId|exception/);
  });

  test("sorts runtime diagnostics by stable rank", () => {
    const sorted = sortRuntimeDiagnostics([
      runtimeDiagnostic({
        code: RUNTIME_DIAGNOSTIC_CODES.IDENTITY_RESOLVER_FAILED,
        message: "b",
      }),
      runtimeDiagnostic({
        code: RUNTIME_DIAGNOSTIC_CODES.INVALID_PATH,
        message: "a",
      }),
    ]);
    expect(sorted.map((item) => item.code)).toEqual([
      RUNTIME_DIAGNOSTIC_CODES.INVALID_PATH,
      RUNTIME_DIAGNOSTIC_CODES.IDENTITY_RESOLVER_FAILED,
    ]);
  });
});
