import fs from "node:fs";
import path from "node:path";
import { extractArchitecture } from "./extractor.ts";
import { resolveOwner } from "./owner-resolver.ts";
import { parseCoverageMatrix } from "./parser.ts";
import { resolveCommands, resolveTests } from "./test-resolver.ts";
import {
  ACCEPTANCE_CAPABILITY,
  ACCEPTANCE_CHANGE,
  COVERAGE_SCHEMA_VERSION,
  FORBIDDEN_DEFERRED_IDS,
  REQUIRED_ACCEPTANCE_COUNT,
  REQUIRED_DEFERRED_COUNT,
  REQUIRED_DIAGNOSTIC_COUNT,
  REQUIRED_INVARIANT_COUNT,
  REQUIRED_PACKAGE_COUNT,
  REQUIRED_PREREQUISITE_IDS,
  REQUIRED_SLICE_COUNT,
  type CatalogEntry,
  type CoverageMatrix,
  type MatrixIssue,
} from "./types.ts";

export function loadCoverageMatrix(filePath: string): { matrix?: CoverageMatrix; issues: MatrixIssue[] } {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  return parseCoverageMatrix(raw, path.basename(filePath));
}

export function validateCoverageMatrix(workspaceRoot: string, matrix: CoverageMatrix): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  if (matrix.schemaVersion !== COVERAGE_SCHEMA_VERSION) {
    issues.push({
      code: "schema-version",
      message: `schemaVersion must be ${COVERAGE_SCHEMA_VERSION}, got ${matrix.schemaVersion}`,
    });
  }

  const architecturePath = path.join(workspaceRoot, "docs/architecture.md");
  const extracted = extractArchitecture(fs.readFileSync(architecturePath, "utf8"));
  issues.push(...extracted.issues);
  if (extracted.extracted) {
    issues.push(...compareExtracted(matrix, extracted.extracted));
    if (matrix.architectureDigest !== extracted.extracted.digest) {
      issues.push({
        code: "digest-mismatch",
        message: `architectureDigest does not match docs/architecture.md (expected ${extracted.extracted.digest})`,
      });
    }
  }

  issues.push(...assertExactCatalog(matrix.catalogs.invariants, REQUIRED_INVARIANT_COUNT, "INV", 3));
  issues.push(...assertExactCatalog(matrix.catalogs.slices, REQUIRED_SLICE_COUNT, "SLICE", 20));
  issues.push(...assertExactCatalog(matrix.catalogs.acceptanceCriteria, REQUIRED_ACCEPTANCE_COUNT, "AC", 21));
  issues.push(...assertExactCatalog(matrix.catalogs.deferred, REQUIRED_DEFERRED_COUNT, "DEF", 20));
  issues.push(...assertExactCatalog(matrix.catalogs.packages, REQUIRED_PACKAGE_COUNT, "PKG", 17));
  issues.push(...assertExactCatalog(matrix.catalogs.diagnosticSources, REQUIRED_DIAGNOSTIC_COUNT, "DIAG", 19));

  for (const id of FORBIDDEN_DEFERRED_IDS) {
    if (matrix.catalogs.deferred.some((entry) => entry.id === id)) {
      issues.push({
        code: "forbidden-deferred",
        message: `${id} is a delivered positive contract and must not be registered as deferred`,
        entryId: id,
      });
    }
    const positive = matrix.catalogs.positiveContracts.find((entry) => entry.id === id);
    if (positive === undefined) {
      issues.push({
        code: "missing-positive-contract",
        message: `Missing positive contract ${id}`,
        entryId: id,
      });
    } else if (positive.status !== "covered") {
      issues.push({
        code: "forbidden-deferred",
        message: `${id} must be covered, not ${positive.status}`,
        entryId: id,
      });
    }
  }

  const testsById = new Map(matrix.tests.map((test) => [test.id, test]));
  const productCatalogs = [
    ...matrix.catalogs.invariants,
    ...matrix.catalogs.slices,
    ...matrix.catalogs.acceptanceCriteria,
    ...matrix.catalogs.packages,
    ...matrix.catalogs.directories,
    ...matrix.catalogs.exports,
    ...matrix.catalogs.diagnosticSources,
    ...matrix.catalogs.positiveContracts,
  ];

  for (const entry of productCatalogs) {
    issues.push(...validateProductEntry(workspaceRoot, entry, testsById));
  }
  for (const entry of matrix.catalogs.deferred) {
    if (entry.status !== "deferred" && entry.status !== "optional-unsupported") {
      issues.push({
        code: "deferred-status",
        message: `${entry.id} must use deferred or optional-unsupported status`,
        entryId: entry.id,
      });
    }
    if (entry.evidenceIds.length === 0) {
      issues.push({
        code: "missing-absence-evidence",
        message: `${entry.id} has no absence evidence`,
        entryId: entry.id,
      });
    }
    issues.push(...validateEvidence(entry, testsById, true));
  }

  issues.push(...validatePrerequisites(workspaceRoot, matrix, testsById));
  issues.push(...resolveTests(workspaceRoot, matrix.tests, matrix.commands));
  issues.push(...resolveCommands(workspaceRoot, matrix.commands));
  return issues;
}

function validateProductEntry(
  workspaceRoot: string,
  entry: CatalogEntry,
  testsById: Map<string, CoverageMatrix["tests"][number]>,
): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  if (entry.status === "covered") {
    if (entry.owners.length === 0) {
      issues.push({ code: "missing-owner", message: `${entry.id} has no owner`, entryId: entry.id });
    }
    for (const owner of entry.owners) {
      if (owner.changeId === ACCEPTANCE_CHANGE || owner.capability === ACCEPTANCE_CAPABILITY) {
        issues.push({
          code: "acceptance-owner",
          message: `${entry.id} cannot use ${ACCEPTANCE_CHANGE} as product owner`,
          entryId: entry.id,
        });
      }
      const resolved = resolveOwner(workspaceRoot, owner);
      issues.push(...resolved.issues.map((issue) => ({ ...issue, entryId: entry.id })));
    }
    if (entry.evidenceIds.length === 0) {
      issues.push({ code: "missing-evidence", message: `${entry.id} is covered but has no evidence`, entryId: entry.id });
    }
    const needsCrossLayer =
      entry.id.startsWith("AC-") || entry.id.startsWith("SLICE-04") || entry.id.startsWith("INV-07") || entry.id.startsWith("INV-08");
    issues.push(...validateEvidence(entry, testsById, false, needsCrossLayer));
  }
  return issues;
}

function validateEvidence(
  entry: CatalogEntry,
  testsById: Map<string, CoverageMatrix["tests"][number]>,
  absence: boolean,
  requireIntegration = false,
): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  let hasIntegration = false;
  for (const evidenceId of entry.evidenceIds) {
    const test = testsById.get(evidenceId);
    if (test === undefined) {
      issues.push({
        code: "dangling-test",
        message: `${entry.id} references missing test ${evidenceId}`,
        entryId: entry.id,
      });
      continue;
    }
    if (absence && test.kind !== "absence" && test.kind !== "type" && test.kind !== "docs") {
      issues.push({
        code: "missing-absence-evidence",
        message: `${entry.id} evidence ${evidenceId} is not an absence/type/docs test`,
        entryId: entry.id,
      });
    }
    if (test.kind === "integration" || test.kind === "contract") {
      hasIntegration = true;
    }
  }
  if (requireIntegration && !hasIntegration) {
    issues.push({
      code: "missing-integration-evidence",
      message: `${entry.id} requires at least one integration or contract evidence`,
      entryId: entry.id,
    });
  }
  return issues;
}

function validatePrerequisites(
  workspaceRoot: string,
  matrix: CoverageMatrix,
  testsById: Map<string, CoverageMatrix["tests"][number]>,
): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  const ids = new Set(matrix.prerequisites.map((item) => item.id));
  for (const required of REQUIRED_PREREQUISITE_IDS) {
    if (!ids.has(required)) {
      issues.push({ code: "missing-prerequisite", message: `Missing prerequisite ${required}`, entryId: required });
    }
  }
  for (const prerequisite of matrix.prerequisites) {
    if (prerequisite.status === "unresolved") {
      issues.push({
        code: "unresolved-prerequisite",
        message: `${prerequisite.id} is unresolved`,
        entryId: prerequisite.id,
      });
    }
    const resolved = resolveOwner(workspaceRoot, prerequisite.owner);
    issues.push(...resolved.issues.map((issue) => ({ ...issue, entryId: prerequisite.id })));
    if (prerequisite.evidenceIds.length === 0) {
      issues.push({
        code: "missing-evidence",
        message: `${prerequisite.id} has no contract evidence`,
        entryId: prerequisite.id,
      });
    }
    for (const evidenceId of prerequisite.evidenceIds) {
      if (!testsById.has(evidenceId)) {
        issues.push({
          code: "dangling-test",
          message: `${prerequisite.id} references missing test ${evidenceId}`,
          entryId: prerequisite.id,
        });
      }
    }
  }
  return issues;
}

function assertExactCatalog(entries: readonly CatalogEntry[], count: number, prefix: string, section: number): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  if (entries.length !== count) {
    issues.push({
      code: "count-mismatch",
      message: `${prefix} catalog expected ${count} entries, found ${entries.length}`,
    });
  }
  const seen = new Set<string>();
  for (let ordinal = 1; ordinal <= count; ordinal += 1) {
    const id = `${prefix}-${String(ordinal).padStart(2, "0")}`;
    seen.add(id);
    if (!entries.some((entry) => entry.id === id && entry.ordinal === ordinal && entry.section === section)) {
      issues.push({
        code: "missing-catalog-id",
        message: `Missing ${id} in section ${section}`,
        entryId: id,
      });
    }
  }
  for (const entry of entries) {
    if (!seen.has(entry.id) && entry.id.startsWith(`${prefix}-`)) {
      issues.push({
        code: "extra-catalog-id",
        message: `Unexpected catalog id ${entry.id}`,
        entryId: entry.id,
      });
    }
  }
  return issues;
}

function compareExtracted(
  matrix: CoverageMatrix,
  extracted: NonNullable<ReturnType<typeof extractArchitecture>["extracted"]>,
): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  const pairs: Array<{ catalog: readonly CatalogEntry[]; extracted: typeof extracted.invariants; label: string }> = [
    { catalog: matrix.catalogs.invariants, extracted: extracted.invariants, label: "INV" },
    { catalog: matrix.catalogs.slices, extracted: extracted.slices, label: "SLICE" },
    { catalog: matrix.catalogs.acceptanceCriteria, extracted: extracted.acceptanceCriteria, label: "AC" },
    { catalog: matrix.catalogs.deferred, extracted: extracted.deferred, label: "DEF" },
  ];
  for (const pair of pairs) {
    const extractedById = new Map(pair.extracted.map((item) => [item.id, item]));
    for (const entry of pair.catalog) {
      const expected = extractedById.get(entry.id);
      if (expected === undefined) {
        issues.push({
          code: "architecture-drift",
          message: `${entry.id} is not in architecture section ${entry.section}`,
          entryId: entry.id,
        });
        continue;
      }
      if (entry.normalizedText !== expected.normalizedText || entry.ordinal !== expected.ordinal || entry.section !== expected.section) {
        issues.push({
          code: "architecture-drift",
          message: `${entry.id} text/ordinal/section drifted from docs/architecture.md section ${expected.section}`,
          entryId: entry.id,
        });
      }
    }
  }
  return issues;
}
