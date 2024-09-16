import { describe, expect, test } from "vitest";
import { parseCoverageMatrix } from "../../tools/architecture-check/v1/parser.js";
import { COVERAGE_SCHEMA_VERSION } from "../../tools/architecture-check/v1/types.js";

function sample(): Record<string, unknown> {
  return {
    schemaVersion: COVERAGE_SCHEMA_VERSION,
    architectureDigest: "abc",
    catalogs: {
      invariants: [],
      slices: [],
      acceptanceCriteria: [],
      packages: [],
      directories: [],
      exports: [],
      diagnosticSources: [],
      deferred: [],
      positiveContracts: [],
    },
    prerequisites: [],
    tests: [],
    commands: [],
  };
}

describe("v1 coverage parser", () => {
  test("V1-MATRIX-PARSE-OK loads a well-formed coverage object", () => {
    const { matrix, issues } = parseCoverageMatrix(sample());
    expect(issues).toEqual([]);
    expect(matrix?.schemaVersion).toBe(COVERAGE_SCHEMA_VERSION);
    expect(Object.isFrozen(matrix)).toBe(true);
  });

  test("V1-MATRIX-UNKNOWN-FIELD rejects unknown fields", () => {
    const input = { ...sample(), extra: true };
    const { issues } = parseCoverageMatrix(input);
    expect(issues.some((issue) => issue.code === "unknown-field")).toBe(true);
  });

  test("V1-MATRIX-DUPLICATE-ID rejects duplicate catalog ids", () => {
    const input = sample();
    const catalogs = input.catalogs as Record<string, unknown>;
    catalogs.invariants = [
      {
        id: "INV-01",
        section: 3,
        ordinal: 1,
        normalizedText: "a",
        status: "covered",
        owners: [],
        evidenceIds: [],
      },
      {
        id: "INV-01",
        section: 3,
        ordinal: 2,
        normalizedText: "b",
        status: "covered",
        owners: [],
        evidenceIds: [],
      },
    ];
    const { issues } = parseCoverageMatrix(input);
    expect(issues.some((issue) => issue.code === "duplicate-id")).toBe(true);
  });

  test("V1-MATRIX-INVALID-STATUS rejects an unknown catalog status", () => {
    const input = sample();
    const catalogs = input.catalogs as Record<string, unknown>;
    catalogs.invariants = [
      {
        id: "INV-01",
        section: 3,
        ordinal: 1,
        normalizedText: "a",
        status: "maybe",
        owners: [],
        evidenceIds: [],
      },
    ];
    const { issues } = parseCoverageMatrix(input);
    expect(issues.some((issue) => issue.code === "invalid-status")).toBe(true);
  });
});
