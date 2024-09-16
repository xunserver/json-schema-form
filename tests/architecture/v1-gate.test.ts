import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { GATE_STAGES } from "../../tools/architecture-check/v1/gate.js";
import { collectEvidence, EVIDENCE_FILE, PASS_MARKER } from "../../tools/architecture-check/v1/evidence.js";
import { loadCoverageMatrix } from "../../tools/architecture-check/v1/matrix.js";
import { REPO_ROOT, makeTempDir, writeJson } from "../lib/fs.js";

describe("v1 gate and evidence", () => {
  test("V1-GATE-COMMAND-CATALOG uses only root scripts and builtins", () => {
    const loaded = loadCoverageMatrix(path.join(REPO_ROOT, "tests/architecture/v1-coverage.json"));
    expect(loaded.matrix?.commands.every((command) => command.kind === "root-script" || command.kind === "builtin")).toBe(
      true,
    );
    expect(GATE_STAGES.map((stage) => stage.id)).toEqual([
      "prerequisite-traceability",
      "manifest-export",
      "build",
      "typecheck",
      "unit-contract",
      "boundaries",
      "portability-integration",
      "ssr-browser-examples",
      "deferred-docs",
    ]);
  });

  test("V1-EVIDENCE-ATOMIC publishes evidence only after success", () => {
    const root = makeTempDir("v1-evidence-ok-");
    const result = collectEvidence(root, {
      schemaVersion: 1,
      architectureDigest: "abc",
      tools: { node: process.version },
      commands: [{ id: "build", status: "pass", exitCode: 0 }],
      testIds: ["atomic-sample"],
      passed: true,
    });
    expect(result.passed).toBe(true);
    expect(fs.existsSync(path.join(root, "artifacts/v1", EVIDENCE_FILE))).toBe(true);
    expect(fs.existsSync(path.join(root, "artifacts/v1", PASS_MARKER))).toBe(true);
  });

  test("V1-EVIDENCE-FAILURE removes the pass marker and keeps a failure summary", () => {
    const root = makeTempDir("v1-evidence-fail-");
    fs.mkdirSync(path.join(root, "artifacts/v1"), { recursive: true });
    fs.writeFileSync(path.join(root, "artifacts/v1", PASS_MARKER), "stale\n");
    const result = collectEvidence(root, {
      schemaVersion: 1,
      architectureDigest: "abc",
      tools: { node: process.version },
      commands: [{ id: "ssr", status: "fail", exitCode: 1 }],
      testIds: ["failure-sample"],
      passed: false,
    });
    expect(result.passed).toBe(false);
    expect(fs.existsSync(path.join(root, "artifacts/v1", PASS_MARKER))).toBe(false);
    expect(fs.readFileSync(path.join(root, "artifacts/v1/failure.txt"), "utf8")).toContain("ssr");
  });

  test("V1-CI-FROZEN-LOCKFILE keeps the local gate from reinstalling the workspace", () => {
    const workflow = fs.readFileSync(path.join(REPO_ROOT, ".github/workflows/v1.yml"), "utf8");
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("pnpm verify:v1");
    const pkg = fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8");
    expect(pkg).not.toMatch(/rm -rf node_modules/);
    expect(os.tmpdir()).toBeTruthy();
    writeJson(path.join(makeTempDir("lock-"), "probe.json"), { ok: true });
  });
});
