import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { loadCoverageMatrix, validateCoverageMatrix } from "../../tools/architecture-check/v1/matrix.js";
import { FORBIDDEN_DEFERRED_IDS } from "../../tools/architecture-check/v1/types.js";
import { REPO_ROOT, makeTempDir, writeJson } from "../lib/fs.js";

describe("v1 coverage matrix", () => {
  test("V1-MATRIX-PRODUCT-OWNER rejects acceptance as a product owner", () => {
    const loaded = loadCoverageMatrix(path.join(REPO_ROOT, "tests/architecture/v1-coverage.json"));
    expect(loaded.issues).toEqual([]);
    expect(loaded.matrix).toBeDefined();
    const issues = validateCoverageMatrix(REPO_ROOT, loaded.matrix!);
    expect(issues.filter((issue) => issue.code === "acceptance-owner")).toEqual([]);
    const mutated = structuredClone(loaded.matrix!);
    mutated.catalogs.invariants[0] = {
      ...mutated.catalogs.invariants[0]!,
      owners: [
        {
          changeId: "complete-v1-architecture-acceptance",
          capability: "v1-architecture-acceptance",
          requirement: "nope",
          scenario: "nope",
        },
      ],
    };
    const rejected = validateCoverageMatrix(REPO_ROOT, mutated);
    expect(rejected.some((issue) => issue.code === "acceptance-owner")).toBe(true);
    expect(mutated.catalogs.acceptanceCriteria.some((entry) => entry.evidenceIds.length > 0)).toBe(true);
  });

  test("V1-MATRIX-POSITIVE-NOT-DEFERRED keeps delivered contracts out of deferred", () => {
    const loaded = loadCoverageMatrix(path.join(REPO_ROOT, "tests/architecture/v1-coverage.json"));
    const issues = validateCoverageMatrix(REPO_ROOT, loaded.matrix!);
    expect(issues.filter((issue) => issue.code === "forbidden-deferred")).toEqual([]);
    for (const id of FORBIDDEN_DEFERRED_IDS) {
      expect(loaded.matrix!.catalogs.deferred.some((entry) => entry.id === id)).toBe(false);
      expect(loaded.matrix!.catalogs.positiveContracts.some((entry) => entry.id === id && entry.status === "covered")).toBe(
        true,
      );
    }
    const mutated = structuredClone(loaded.matrix!);
    mutated.catalogs.deferred = [
      ...mutated.catalogs.deferred,
      {
        id: "POS-VALUE-INITIALIZER",
        section: 20,
        ordinal: 99,
        normalizedText: "valueInitializers",
        status: "deferred",
        owners: [],
        evidenceIds: ["V1-DEFERRED-ABSENCE"],
      },
    ];
    expect(validateCoverageMatrix(REPO_ROOT, mutated).some((issue) => issue.code === "forbidden-deferred")).toBe(true);
  });

  test("V1-MATRIX-PREFLIGHT fails unresolved prerequisites before cross-stack work", () => {
    const loaded = loadCoverageMatrix(path.join(REPO_ROOT, "tests/architecture/v1-coverage.json"));
    const mutated = structuredClone(loaded.matrix!);
    mutated.prerequisites = mutated.prerequisites.map((item, index) =>
      index === 0 ? { ...item, status: "unresolved" as const, evidenceIds: [] } : item,
    );
    const issues = validateCoverageMatrix(REPO_ROOT, mutated);
    expect(issues.some((issue) => issue.code === "unresolved-prerequisite")).toBe(true);
    expect(issues.some((issue) => issue.code === "missing-evidence")).toBe(true);
  });

  test("V1-MATRIX-UNRESOLVED-PRE does not load shims or deep imports", () => {
    const loaded = loadCoverageMatrix(path.join(REPO_ROOT, "tests/architecture/v1-coverage.json"));
    const mutated = structuredClone(loaded.matrix!);
    mutated.prerequisites = [
      {
        id: "PRE-WIDGET-HELPER",
        status: "unresolved",
        owner: {
          changeId: "missing-owner",
          capability: "missing-cap",
          requirement: "none",
          scenario: "none",
        },
        publicEntry: "@xunserver-jsf/core/extension",
        evidenceIds: [],
      },
    ];
    const issues = validateCoverageMatrix(REPO_ROOT, mutated);
    expect(issues.some((issue) => issue.code === "dangling-owner" || issue.code === "unresolved-prerequisite")).toBe(
      true,
    );
    const root = makeTempDir("preflight-");
    writeJson(path.join(root, "shim.json"), { deepImport: false });
    expect(fs.existsSync(path.join(root, "shim.json"))).toBe(true);
  });
});
