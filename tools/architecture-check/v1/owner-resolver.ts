import fs from "node:fs";
import path from "node:path";
import type { MatrixIssue, OwnerRef } from "./types.ts";

export interface ResolvedOwner {
  readonly owner: OwnerRef;
  readonly file: string;
  readonly source: "active" | "archive" | "durable";
}

export interface ResolvedChangeSpec {
  readonly changeId: string;
  readonly capability: string;
  readonly file: string;
  readonly source: "active" | "archive";
}

export function resolveChangeSpec(
  workspaceRoot: string,
  changeId: string,
  capability: string,
): { resolved?: ResolvedChangeSpec; issues: MatrixIssue[] } {
  const candidates = collectChangeSpecFiles(workspaceRoot, changeId, capability);
  const active = candidates.find((candidate) => candidate.source === "active");
  if (active !== undefined) {
    return {
      resolved: { changeId, capability, file: active.file, source: "active" },
      issues: [],
    };
  }

  const archived = candidates.filter((candidate) => candidate.source === "archive");

  if (archived.length === 1) {
    return {
      resolved: { changeId, capability, file: archived[0]!.file, source: "archive" },
      issues: [],
    };
  }
  if (archived.length > 1) {
    return {
      issues: [
        {
          code: "ambiguous-change-spec",
          message: `Multiple archived specs resolve ${changeId}/${capability}: ${archived
            .map((candidate) => rel(workspaceRoot, candidate.file))
            .join(", ")}`,
        },
      ],
    };
  }
  return {
    issues: [
      {
        code: "missing-change-spec",
        message: `Cannot resolve active or archived spec for ${changeId}/${capability}`,
      },
    ],
  };
}

export function resolveOwner(workspaceRoot: string, owner: OwnerRef): { resolved?: ResolvedOwner; issues: MatrixIssue[] } {
  const candidates = collectOwnerFiles(workspaceRoot, owner.changeId, owner.capability);
  const matches: ResolvedOwner[] = [];
  for (const candidate of candidates) {
    const parsed = parseSpec(fs.readFileSync(candidate.file, "utf8"));
    const requirement = parsed.find((item) => item.requirement === owner.requirement);
    if (requirement === undefined) {
      continue;
    }
    const scenarioMatches = requirement.scenarios.filter((scenario) => scenario === owner.scenario);
    if (scenarioMatches.length === 1) {
      matches.push({ owner, file: candidate.file, source: candidate.source });
    } else if (scenarioMatches.length > 1) {
      return {
        issues: [
          {
            code: "ambiguous-scenario",
            message: `Scenario "${owner.scenario}" is duplicated under requirement "${owner.requirement}" in ${rel(workspaceRoot, candidate.file)}`,
          },
        ],
      };
    }
  }

  if (matches.length === 0) {
    const sameTitle = collectSameTitleScenarios(workspaceRoot, owner);
    if (sameTitle.length > 1) {
      return {
        issues: [
          {
            code: "ambiguous-scenario",
            message: `Scenario "${owner.scenario}" appears under multiple requirements; specify requirement "${owner.requirement}" that exists. Candidates: ${sameTitle.join("; ")}`,
          },
        ],
      };
    }
    return {
      issues: [
        {
          code: "dangling-owner",
          message: `Cannot resolve ${owner.changeId}/${owner.capability} requirement "${owner.requirement}" scenario "${owner.scenario}"`,
        },
      ],
    };
  }

  const preferred = preferOwner(matches);
  return { resolved: preferred, issues: [] };
}

function collectOwnerFiles(
  workspaceRoot: string,
  changeId: string,
  capability: string,
): readonly { file: string; source: ResolvedOwner["source"] }[] {
  const files: { file: string; source: ResolvedOwner["source"] }[] = [
    ...collectChangeSpecFiles(workspaceRoot, changeId, capability),
  ];
  const durable = path.join(workspaceRoot, "specs", capability, "spec.md");
  if (fs.existsSync(durable)) {
    files.push({ file: durable, source: "durable" });
  }
  return files;
}

function collectChangeSpecFiles(
  workspaceRoot: string,
  changeId: string,
  capability: string,
): readonly { file: string; source: "active" | "archive" }[] {
  const files: { file: string; source: "active" | "archive" }[] = [];
  const active = path.join(workspaceRoot, "changes", changeId, "specs", capability, "spec.md");
  if (fs.existsSync(active)) {
    files.push({ file: active, source: "active" });
  }
  const archiveRoot = path.join(workspaceRoot, "changes/archive");
  if (fs.existsSync(archiveRoot)) {
    const archiveEntries = fs
      .readdirSync(archiveRoot, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of archiveEntries) {
      if (!entry.isDirectory() || !entry.name.endsWith(`-${changeId}`)) {
        continue;
      }
      const archived = path.join(archiveRoot, entry.name, "specs", capability, "spec.md");
      if (fs.existsSync(archived)) {
        files.push({ file: archived, source: "archive" });
      }
    }
  }
  return files;
}

function collectSameTitleScenarios(workspaceRoot: string, owner: OwnerRef): string[] {
  const files = collectOwnerFiles(workspaceRoot, owner.changeId, owner.capability);
  const found: string[] = [];
  for (const candidate of files) {
    const parsed = parseSpec(fs.readFileSync(candidate.file, "utf8"));
    for (const requirement of parsed) {
      if (requirement.scenarios.includes(owner.scenario)) {
        found.push(`${requirement.requirement} @ ${rel(workspaceRoot, candidate.file)}`);
      }
    }
  }
  return found;
}

function preferOwner(matches: readonly ResolvedOwner[]): ResolvedOwner {
  const rank = { active: 0, archive: 1, durable: 2 } as const;
  return [...matches].sort((left, right) => rank[left.source] - rank[right.source])[0]!;
}

export function parseSpec(markdown: string): readonly { requirement: string; scenarios: readonly string[] }[] {
  const requirements: { requirement: string; scenarios: string[] }[] = [];
  let current: { requirement: string; scenarios: string[] } | undefined;
  for (const line of markdown.split(/\r?\n/)) {
    const requirement = line.match(/^### Requirement:\s*(.+)\s*$/);
    if (requirement) {
      current = { requirement: requirement[1]!.trim(), scenarios: [] };
      requirements.push(current);
      continue;
    }
    const scenario = line.match(/^#### Scenario:\s*(.+)\s*$/);
    if (scenario && current) {
      current.scenarios.push(scenario[1]!.trim());
    }
  }
  return requirements;
}

function rel(workspaceRoot: string, file: string): string {
  return path.relative(workspaceRoot, file);
}
