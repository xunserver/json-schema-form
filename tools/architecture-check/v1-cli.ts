import path from "node:path";
import { parseArgs } from "node:util";
import { loadCoverageMatrix, validateCoverageMatrix } from "./v1/matrix.ts";
import { checkV1Workspace } from "./v1/workspace.ts";
import { writeCoverageIndex } from "./v1/docs.ts";
import { runV1Gate } from "./v1/gate.ts";
import { checkArchitecture, formatArchitectureDiagnostic } from "./check.ts";

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    mode: { type: "string" },
  },
});

const workspaceRoot = path.resolve(values.root ?? process.cwd());
const mode = values.mode ?? "boundaries";

if (mode === "boundaries") {
  const diagnostics = checkArchitecture(workspaceRoot);
  if (diagnostics.length === 0) {
    process.stdout.write(`Architecture boundaries passed for ${workspaceRoot}\n`);
    process.exit(0);
  }
  for (const diagnostic of diagnostics) {
    process.stderr.write(`${formatArchitectureDiagnostic(diagnostic)}\n`);
  }
  process.stderr.write(`Architecture boundaries failed with ${diagnostics.length} diagnostic(s).\n`);
  process.exit(1);
}

if (mode === "matrix") {
  const loaded = loadCoverageMatrix(path.join(workspaceRoot, "tests/architecture/v1-coverage.json"));
  const issues = [...loaded.issues, ...(loaded.matrix ? validateCoverageMatrix(workspaceRoot, loaded.matrix) : [])];
  if (issues.length === 0 && loaded.matrix) {
    writeCoverageIndex(workspaceRoot, loaded.matrix);
    process.stdout.write("v1 coverage matrix passed\n");
    process.exit(0);
  }
  for (const issue of issues) {
    process.stderr.write(`${issue.code}${issue.entryId ? ` ${issue.entryId}` : ""}: ${issue.message}\n`);
  }
  process.exit(1);
}

if (mode === "workspace") {
  const issues = checkV1Workspace(workspaceRoot);
  if (issues.length === 0) {
    process.stdout.write("v1 workspace layout passed\n");
    process.exit(0);
  }
  for (const issue of issues) {
    process.stderr.write(`${issue.code}${issue.entryId ? ` ${issue.entryId}` : ""}: ${issue.message}\n`);
  }
  process.exit(1);
}

if (mode === "gate") {
  const result = runV1Gate(workspaceRoot);
  if (result.passed) {
    process.stdout.write("v1 architecture gate passed\n");
    process.exit(0);
  }
  for (const issue of result.issues) {
    process.stderr.write(`${issue.code}${issue.entryId ? ` ${issue.entryId}` : ""}: ${issue.message}\n`);
  }
  process.exit(result.exitCode || 1);
}

process.stderr.write(`Unknown architecture-check mode: ${mode}\n`);
process.exit(2);
