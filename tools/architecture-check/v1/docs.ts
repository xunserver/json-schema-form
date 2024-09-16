import fs from "node:fs";
import path from "node:path";
import type { CoverageMatrix } from "./types.ts";

export function renderCoverageIndex(matrix: CoverageMatrix): string {
  const lines = [
    "# v1 architecture coverage index",
    "",
    "本文件由 `tests/architecture/v1-coverage.json` 生成，仅作索引，不改写 `docs/architecture.md` 规范正文。",
    "",
    `- schemaVersion: ${matrix.schemaVersion}`,
    `- architectureDigest: \`${matrix.architectureDigest}\``,
    "",
    "## Invariants",
    "",
    ...table(matrix.catalogs.invariants),
    "",
    "## Slices",
    "",
    ...table(matrix.catalogs.slices),
    "",
    "## Acceptance criteria",
    "",
    ...table(matrix.catalogs.acceptanceCriteria),
    "",
    "## Packages / directories / exports",
    "",
    ...table([
      ...matrix.catalogs.packages,
      ...matrix.catalogs.directories,
      ...matrix.catalogs.exports,
    ]),
    "",
    "## Diagnostic sources",
    "",
    ...table(matrix.catalogs.diagnosticSources),
    "",
    "## Positive contracts (not deferred)",
    "",
    ...table(matrix.catalogs.positiveContracts),
    "",
    "## Deferred / optional-unsupported",
    "",
    ...table(matrix.catalogs.deferred),
    "",
    "## Prerequisites",
    "",
    "| ID | Status | Owner | Entry | Evidence |",
    "|---|---|---|---|---|",
    ...matrix.prerequisites.map(
      (item) =>
        `| ${item.id} | ${item.status} | ${item.owner.changeId} / ${item.owner.scenario} | ${item.publicEntry} | ${item.evidenceIds.join(", ")} |`,
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export function writeCoverageIndex(workspaceRoot: string, matrix: CoverageMatrix): string {
  const output = path.join(workspaceRoot, "docs/generated/v1-coverage.md");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, renderCoverageIndex(matrix));
  return output;
}

function table(entries: CoverageMatrix["catalogs"]["invariants"]): string[] {
  return [
    "| ID | Status | Owner | Evidence |",
    "|---|---|---|---|",
    ...entries.map((entry) => {
      const owner = entry.owners[0] ? `${entry.owners[0].changeId} / ${entry.owners[0].scenario}` : "(none)";
      return `| ${entry.id} | ${entry.status} | ${owner} | ${entry.evidenceIds.join(", ")} |`;
    }),
  ];
}
