export const COVERAGE_SCHEMA_VERSION = 1;

export const CATALOG_STATUSES = ["covered", "deferred", "optional-unsupported"] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const PREREQUISITE_STATUSES = ["resolved", "unresolved"] as const;
export type PrerequisiteStatus = (typeof PREREQUISITE_STATUSES)[number];

export const TEST_KINDS = ["unit", "contract", "integration", "type", "absence", "docs"] as const;
export type TestKind = (typeof TEST_KINDS)[number];

export const COMMAND_KINDS = ["root-script", "builtin"] as const;
export type CommandKind = (typeof COMMAND_KINDS)[number];

export const BUILTIN_COMMANDS = [
  "matrix-validate",
  "architecture-extractor",
  "workspace-layout",
  "export-surface",
  "evidence-collect",
] as const;
export type BuiltinCommand = (typeof BUILTIN_COMMANDS)[number];

export interface OwnerRef {
  readonly changeId: string;
  readonly capability: string;
  readonly requirement: string;
  readonly scenario: string;
}

export interface CatalogEntry {
  readonly id: string;
  readonly section: number;
  readonly ordinal: number;
  readonly normalizedText: string;
  readonly status: CatalogStatus;
  readonly owners: readonly OwnerRef[];
  readonly evidenceIds: readonly string[];
}

export interface PrerequisiteRecord {
  readonly id: string;
  readonly status: PrerequisiteStatus;
  readonly owner: OwnerRef;
  readonly publicEntry: string;
  readonly evidenceIds: readonly string[];
}

export interface TestRecord {
  readonly id: string;
  readonly kind: TestKind;
  readonly file: string;
  readonly title: string;
  readonly commandId: string;
}

export interface CommandRecord {
  readonly id: string;
  readonly kind: CommandKind;
  readonly name: string;
}

export interface CoverageCatalogs {
  readonly invariants: readonly CatalogEntry[];
  readonly slices: readonly CatalogEntry[];
  readonly acceptanceCriteria: readonly CatalogEntry[];
  readonly packages: readonly CatalogEntry[];
  readonly directories: readonly CatalogEntry[];
  readonly exports: readonly CatalogEntry[];
  readonly diagnosticSources: readonly CatalogEntry[];
  readonly deferred: readonly CatalogEntry[];
  readonly positiveContracts: readonly CatalogEntry[];
}

export interface CoverageMatrix {
  readonly schemaVersion: number;
  readonly architectureDigest: string;
  readonly catalogs: CoverageCatalogs;
  readonly prerequisites: readonly PrerequisiteRecord[];
  readonly tests: readonly TestRecord[];
  readonly commands: readonly CommandRecord[];
}

export interface MatrixIssue {
  readonly code: string;
  readonly message: string;
  readonly entryId?: string;
  readonly path?: string;
}

export const FORBIDDEN_DEFERRED_IDS = [
  "POS-VIEW-COLLAPSED-ACTIVETAB",
  "POS-VALUE-INITIALIZER",
  "POS-DIALECT-ADAPTER",
  "POS-X-KEYWORD-SPLIT",
] as const;

export const REQUIRED_INVARIANT_COUNT = 12;
export const REQUIRED_SLICE_COUNT = 10;
export const REQUIRED_ACCEPTANCE_COUNT = 8;
export const REQUIRED_DEFERRED_COUNT = 8;
export const REQUIRED_DIAGNOSTIC_COUNT = 5;
export const REQUIRED_PACKAGE_COUNT = 6;
export const REQUIRED_PREREQUISITE_IDS = [
  "PRE-WIDGET-HELPER",
  "PRE-RENDER-BINDING",
  "PRE-BLUR-PORT",
  "PRE-WIDGET-INTERACTION",
  "PRE-REQUIRED-PRESENTATION",
  "PRE-VIEW-STATE",
  "PRE-CORE-LAYOUT",
  "PRE-CONTRIBUTION-PORTS",
] as const;

export const ACCEPTANCE_CAPABILITY = "v1-architecture-acceptance";
export const ACCEPTANCE_CHANGE = "complete-v1-architecture-acceptance";
