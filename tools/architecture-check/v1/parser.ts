import { CATALOG_STATUSES, COMMAND_KINDS, TEST_KINDS, PREREQUISITE_STATUSES, type CoverageMatrix, type MatrixIssue } from "./types.ts";

const TOP_KEYS = new Set(["schemaVersion", "architectureDigest", "catalogs", "prerequisites", "tests", "commands"]);
const CATALOG_KEYS = new Set([
  "invariants",
  "slices",
  "acceptanceCriteria",
  "packages",
  "directories",
  "exports",
  "diagnosticSources",
  "deferred",
  "positiveContracts",
]);
const ENTRY_KEYS = new Set(["id", "section", "ordinal", "normalizedText", "status", "owners", "evidenceIds"]);
const OWNER_KEYS = new Set(["changeId", "capability", "requirement", "scenario"]);
const PRE_KEYS = new Set(["id", "status", "owner", "publicEntry", "evidenceIds"]);
const TEST_KEYS = new Set(["id", "kind", "file", "title", "commandId"]);
const COMMAND_KEYS = new Set(["id", "kind", "name"]);

export function parseCoverageMatrix(input: unknown, source = "matrix"): { matrix?: CoverageMatrix; issues: MatrixIssue[] } {
  const issues: MatrixIssue[] = [];
  if (!isObject(input)) {
    return { issues: [{ code: "invalid-root", message: `${source} must be an object` }] };
  }
  issues.push(...unknownKeys(input, TOP_KEYS, source));
  if (typeof input.schemaVersion !== "number") {
    issues.push({ code: "invalid-schema-version", message: "schemaVersion must be a number" });
  }
  if (typeof input.architectureDigest !== "string" || input.architectureDigest.length === 0) {
    issues.push({ code: "invalid-digest", message: "architectureDigest must be a non-empty string" });
  }
  if (!isObject(input.catalogs)) {
    issues.push({ code: "invalid-catalogs", message: "catalogs must be an object" });
    return { issues };
  }
  issues.push(...unknownKeys(input.catalogs, CATALOG_KEYS, `${source}.catalogs`));

  const catalogs: Record<string, unknown> = {};
  for (const key of CATALOG_KEYS) {
    catalogs[key] = parseEntryArray(input.catalogs[key], `${source}.catalogs.${key}`, issues);
  }
  const prerequisites = parseArray(input.prerequisites, `${source}.prerequisites`, issues, parsePrerequisite);
  const tests = parseArray(input.tests, `${source}.tests`, issues, parseTest);
  const commands = parseArray(input.commands, `${source}.commands`, issues, parseCommand);

  assertUniqueIds(
    [
      ...Object.values(catalogs).flatMap((entries) => (Array.isArray(entries) ? entries.map((entry) => entry.id) : [])),
      ...prerequisites.map((entry) => entry.id),
      ...tests.map((entry) => entry.id),
      ...commands.map((entry) => entry.id),
    ],
    issues,
  );

  if (issues.length > 0) {
    return { issues };
  }

  return {
    matrix: Object.freeze({
      schemaVersion: input.schemaVersion as number,
      architectureDigest: input.architectureDigest as string,
      catalogs: catalogs as CoverageMatrix["catalogs"],
      prerequisites,
      tests,
      commands,
    }),
    issues,
  };
}

function parseEntryArray(value: unknown, path: string, issues: MatrixIssue[]): readonly Record<string, unknown>[] {
  return parseArray(value, path, issues, (item, itemPath) => parseCatalogEntry(item, itemPath, issues));
}

function parseCatalogEntry(value: unknown, path: string, issues: MatrixIssue[]): Record<string, unknown> {
  if (!isObject(value)) {
    issues.push({ code: "invalid-entry", message: `${path} must be an object`, path });
    return {};
  }
  issues.push(...unknownKeys(value, ENTRY_KEYS, path));
  if (typeof value.id !== "string" || value.id.length === 0) {
    issues.push({ code: "invalid-id", message: `${path}.id must be a non-empty string`, path });
  }
  if (typeof value.section !== "number") {
    issues.push({ code: "invalid-section", message: `${path}.section must be a number`, path, entryId: asString(value.id) });
  }
  if (typeof value.ordinal !== "number") {
    issues.push({ code: "invalid-ordinal", message: `${path}.ordinal must be a number`, path, entryId: asString(value.id) });
  }
  if (typeof value.normalizedText !== "string") {
    issues.push({ code: "invalid-text", message: `${path}.normalizedText must be a string`, path, entryId: asString(value.id) });
  }
  if (!isStatus(value.status, CATALOG_STATUSES)) {
    issues.push({
      code: "invalid-status",
      message: `${path}.status must be one of ${CATALOG_STATUSES.join(", ")}`,
      path,
      entryId: asString(value.id),
    });
  }
  const owners = parseArray(value.owners, `${path}.owners`, issues, parseOwner);
  const evidenceIds = parseStringArray(value.evidenceIds, `${path}.evidenceIds`, issues);
  return {
    id: value.id,
    section: value.section,
    ordinal: value.ordinal,
    normalizedText: value.normalizedText,
    status: value.status,
    owners,
    evidenceIds,
  };
}

function parseOwner(value: unknown, path: string, issues: MatrixIssue[]): Record<string, string> {
  if (!isObject(value)) {
    issues.push({ code: "invalid-owner", message: `${path} must be an object`, path });
    return { changeId: "", capability: "", requirement: "", scenario: "" };
  }
  issues.push(...unknownKeys(value, OWNER_KEYS, path));
  for (const key of OWNER_KEYS) {
    if (typeof value[key] !== "string" || value[key].length === 0) {
      issues.push({ code: "invalid-owner-field", message: `${path}.${key} must be a non-empty string`, path });
    }
  }
  return {
    changeId: String(value.changeId ?? ""),
    capability: String(value.capability ?? ""),
    requirement: String(value.requirement ?? ""),
    scenario: String(value.scenario ?? ""),
  };
}

function parsePrerequisite(value: unknown, path: string, issues: MatrixIssue[]): Record<string, unknown> {
  if (!isObject(value)) {
    issues.push({ code: "invalid-prerequisite", message: `${path} must be an object`, path });
    return { id: "", status: "unresolved", owner: {}, publicEntry: "", evidenceIds: [] };
  }
  issues.push(...unknownKeys(value, PRE_KEYS, path));
  if (typeof value.id !== "string" || value.id.length === 0) {
    issues.push({ code: "invalid-id", message: `${path}.id must be a non-empty string`, path });
  }
  if (!isStatus(value.status, PREREQUISITE_STATUSES)) {
    issues.push({
      code: "invalid-status",
      message: `${path}.status must be one of ${PREREQUISITE_STATUSES.join(", ")}`,
      path,
      entryId: asString(value.id),
    });
  }
  if (typeof value.publicEntry !== "string" || value.publicEntry.length === 0) {
    issues.push({ code: "invalid-public-entry", message: `${path}.publicEntry must be a non-empty string`, path, entryId: asString(value.id) });
  }
  return {
    id: value.id,
    status: value.status,
    owner: parseOwner(value.owner, `${path}.owner`, issues),
    publicEntry: value.publicEntry,
    evidenceIds: parseStringArray(value.evidenceIds, `${path}.evidenceIds`, issues),
  };
}

function parseTest(value: unknown, path: string, issues: MatrixIssue[]): Record<string, unknown> {
  if (!isObject(value)) {
    issues.push({ code: "invalid-test", message: `${path} must be an object`, path });
    return { id: "", kind: "unit", file: "", title: "", commandId: "" };
  }
  issues.push(...unknownKeys(value, TEST_KEYS, path));
  if (typeof value.id !== "string" || !value.id.startsWith("V1-")) {
    issues.push({ code: "invalid-test-id", message: `${path}.id must start with V1-`, path, entryId: asString(value.id) });
  }
  if (!isStatus(value.kind, TEST_KINDS)) {
    issues.push({ code: "invalid-kind", message: `${path}.kind must be one of ${TEST_KINDS.join(", ")}`, path, entryId: asString(value.id) });
  }
  for (const key of ["file", "title", "commandId"] as const) {
    if (typeof value[key] !== "string" || value[key].length === 0) {
      issues.push({ code: "invalid-test-field", message: `${path}.${key} must be a non-empty string`, path, entryId: asString(value.id) });
    }
  }
  return { id: value.id, kind: value.kind, file: value.file, title: value.title, commandId: value.commandId };
}

function parseCommand(value: unknown, path: string, issues: MatrixIssue[]): Record<string, unknown> {
  if (!isObject(value)) {
    issues.push({ code: "invalid-command", message: `${path} must be an object`, path });
    return { id: "", kind: "root-script", name: "" };
  }
  issues.push(...unknownKeys(value, COMMAND_KEYS, path));
  if (typeof value.id !== "string" || value.id.length === 0) {
    issues.push({ code: "invalid-id", message: `${path}.id must be a non-empty string`, path });
  }
  if (!isStatus(value.kind, COMMAND_KINDS)) {
    issues.push({ code: "invalid-kind", message: `${path}.kind must be one of ${COMMAND_KINDS.join(", ")}`, path, entryId: asString(value.id) });
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    issues.push({ code: "invalid-command-name", message: `${path}.name must be a non-empty string`, path, entryId: asString(value.id) });
  }
  return { id: value.id, kind: value.kind, name: value.name };
}

function parseArray<T>(
  value: unknown,
  path: string,
  issues: MatrixIssue[],
  parseItem: (item: unknown, itemPath: string, issues: MatrixIssue[]) => T,
): T[] {
  if (!Array.isArray(value)) {
    issues.push({ code: "invalid-array", message: `${path} must be an array`, path });
    return [];
  }
  return value.map((item, index) => parseItem(item, `${path}[${index}]`, issues));
}

function parseStringArray(value: unknown, path: string, issues: MatrixIssue[]): string[] {
  if (!Array.isArray(value)) {
    issues.push({ code: "invalid-array", message: `${path} must be an array`, path });
    return [];
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      issues.push({ code: "invalid-string", message: `${path}[${index}] must be a non-empty string`, path });
      return "";
    }
    return item;
  });
}

function assertUniqueIds(ids: readonly string[], issues: MatrixIssue[]): void {
  const seen = new Map<string, number>();
  for (const id of ids) {
    if (!id) {
      continue;
    }
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      issues.push({ code: "duplicate-id", message: `Duplicate id ${id}`, entryId: id });
    }
  }
}

function unknownKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string): MatrixIssue[] {
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => ({ code: "unknown-field", message: `Unknown field ${path}.${key}`, path: `${path}.${key}` }));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStatus<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
