import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { collectEvidence, gitRevision, toolVersions, type EvidenceCommandResult } from "./evidence.ts";
import { loadCoverageMatrix, validateCoverageMatrix } from "./matrix.ts";
import { checkArchitecture } from "../check.ts";
import {
  checkBundleGraph,
  checkCoreLayoutEvidence,
  checkExportSurfaces,
  checkWorkspaceLayout,
} from "./workspace.ts";
import type { MatrixIssue } from "./types.ts";

export const GATE_STAGES = [
  { id: "prerequisite-traceability", kind: "builtin" as const, name: "matrix-validate" },
  { id: "manifest-export", kind: "builtin" as const, name: "workspace-layout" },
  { id: "build", kind: "root-script" as const, name: "build" },
  { id: "typecheck", kind: "root-script" as const, name: "typecheck" },
  { id: "unit-contract", kind: "root-script" as const, name: "test" },
  { id: "boundaries", kind: "root-script" as const, name: "check:boundaries" },
  { id: "portability-integration", kind: "root-script" as const, name: "test:v1:integration" },
  { id: "ssr-browser-examples", kind: "root-script" as const, name: "test:v1:host" },
  { id: "deferred-docs", kind: "root-script" as const, name: "test:v1:docs" },
] as const;

export function runV1Gate(workspaceRoot: string): { passed: boolean; issues: MatrixIssue[]; exitCode: number } {
  const issues: MatrixIssue[] = [];
  const commands: EvidenceCommandResult[] = [];
  const matrixPath = path.join(workspaceRoot, "tests/architecture/v1-coverage.json");
  const loaded = loadCoverageMatrix(matrixPath);
  issues.push(...loaded.issues);
  if (loaded.matrix === undefined) {
    finish(workspaceRoot, false, issues, commands, "");
    return { passed: false, issues, exitCode: 1 };
  }
  const matrixIssues = validateCoverageMatrix(workspaceRoot, loaded.matrix);
  issues.push(...matrixIssues);
  commands.push({
    id: "prerequisite-traceability",
    status: matrixIssues.length === 0 ? "pass" : "fail",
    exitCode: matrixIssues.length === 0 ? 0 : 1,
  });
  if (matrixIssues.length > 0) {
    finish(workspaceRoot, false, issues, commands, loaded.matrix.architectureDigest, loaded.matrix.tests.map((test) => test.id));
    return { passed: false, issues, exitCode: 1 };
  }

  const workspaceIssues = [
    ...checkArchitecture(workspaceRoot).map((diagnostic) => ({
      code: diagnostic.rule,
      message: diagnostic.message,
      path: diagnostic.file,
    })),
    ...checkWorkspaceLayout(workspaceRoot),
    ...checkCoreLayoutEvidence(workspaceRoot),
  ];
  issues.push(...workspaceIssues);
  commands.push({
    id: "manifest-export",
    status: workspaceIssues.length === 0 ? "pass" : "fail",
    exitCode: workspaceIssues.length === 0 ? 0 : 1,
  });
  if (workspaceIssues.length > 0) {
    finish(workspaceRoot, false, issues, commands, loaded.matrix.architectureDigest, loaded.matrix.tests.map((test) => test.id));
    return { passed: false, issues, exitCode: 1 };
  }

  for (const stage of GATE_STAGES.slice(2)) {
    const result = runRootScript(workspaceRoot, stage.name);
    commands.push({
      id: stage.id,
      status: result.status === 0 ? "pass" : "fail",
      exitCode: result.status ?? 1,
    });
    if (result.status !== 0) {
      issues.push({
        code: "gate-command-failed",
        message: `${stage.id} failed with exit ${result.status ?? 1}`,
        entryId: stage.id,
      });
      finish(workspaceRoot, false, issues, commands, loaded.matrix.architectureDigest, loaded.matrix.tests.map((test) => test.id));
      return { passed: false, issues, exitCode: result.status ?? 1 };
    }
    if (stage.id === "build") {
      const builtIssues = [...checkExportSurfaces(workspaceRoot), ...checkBundleGraph(workspaceRoot)];
      issues.push(...builtIssues);
      if (builtIssues.length > 0) {
        finish(workspaceRoot, false, issues, commands, loaded.matrix.architectureDigest, loaded.matrix.tests.map((test) => test.id));
        return { passed: false, issues, exitCode: 1 };
      }
    }
  }

  finish(workspaceRoot, true, issues, commands, loaded.matrix.architectureDigest, loaded.matrix.tests.map((test) => test.id));
  return { passed: true, issues, exitCode: 0 };
}

function runRootScript(workspaceRoot: string, script: string): { status: number | null } {
  const result = spawnSync("pnpm", ["run", script], {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  return { status: result.status };
}

function finish(
  workspaceRoot: string,
  passed: boolean,
  issues: readonly MatrixIssue[],
  commands: readonly EvidenceCommandResult[],
  digest: string,
  testIds: readonly string[] = [],
): void {
  collectEvidence(workspaceRoot, {
    schemaVersion: 1,
    architectureDigest: digest,
    ...(gitRevision(workspaceRoot) === undefined ? {} : { revision: gitRevision(workspaceRoot) }),
    tools: toolVersions(workspaceRoot),
    commands,
    testIds,
    passed,
  });
  if (!passed) {
    const summary = issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n");
    fs.mkdirSync(path.join(workspaceRoot, "artifacts/v1"), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, "artifacts/v1/failure.txt"), `${summary}\n`);
  }
}
