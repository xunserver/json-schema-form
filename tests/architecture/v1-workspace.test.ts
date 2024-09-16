import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { checkArchitecture } from "../../tools/architecture-check/check.js";
import { RULE } from "../../tools/architecture-check/policy.js";
import { checkBundleGraph, checkExportSurfaces, checkV1Workspace, checkWorkspaceLayout } from "../../tools/architecture-check/v1/workspace.js";
import { REPO_ROOT, copyWorkspacePackages, makeTempDir, writeText } from "../lib/fs.js";

describe("v1 workspace layout and dependency graph", () => {
  test("V1-WORKSPACE-LAYOUT accepts the current six packages and examples", () => {
    expect(checkWorkspaceLayout(REPO_ROOT).filter((issue) => issue.code !== "export-mismatch")).toEqual([]);
    expect(checkArchitecture(REPO_ROOT)).toEqual([]);
    expect(checkV1Workspace(REPO_ROOT).every((issue) => issue.code !== "missing-directory")).toBe(true);
  });

  test("V1-WORKSPACE-MISSING reports catalog id and path for a deleted example", () => {
    const root = makeTempDir("v1-layout-");
    fs.mkdirSync(path.join(root, "packages"), { recursive: true });
    const issues = checkWorkspaceLayout(root);
    expect(issues.some((issue) => issue.entryId === "DIR-EX-PLAYGROUND" && issue.path?.includes("playground"))).toBe(true);
    expect(issues.some((issue) => issue.entryId === "DIR-TESTS")).toBe(true);
    fs.mkdirSync(path.join(root, "packages/vue/src/wrong"), { recursive: true });
    const misplaced = checkWorkspaceLayout(root);
    expect(misplaced.some((issue) => issue.entryId === "DIR-VUE")).toBe(true);
  });

  test("V1-DEP-ALLOWLIST keeps the five product edges and host peers", () => {
    expect(checkArchitecture(REPO_ROOT)).toEqual([]);
    const allowedRoot = makeTempDir("v1-dep-");
    copyWorkspacePackages(allowedRoot);
    expect(checkArchitecture(allowedRoot).filter((item) => item.rule === RULE.forbiddenEdge)).toEqual([]);
  });

  test("V1-DEP-FAULT fails reverse, cross-framework, AJV, and MUI X violations", () => {
    const root = makeTempDir("v1-dep-fault-");
    copyWorkspacePackages(root);
    writeText(path.join(root, "packages/core/src/leak.ts"), 'import "ajv";\nimport "@form/vue";\n');
    writeText(path.join(root, "packages/adapter/antd/src/x.ts"), 'import "@mui/x-date-pickers";\nimport "@form/vue";\n');
    const diagnostics = checkArchitecture(root);
    expect(diagnostics.some((item) => item.rule === RULE.forbiddenCorePackage)).toBe(true);
    expect(diagnostics.some((item) => item.rule === RULE.crossFrameworkDependency || item.rule === RULE.reverseDependency)).toBe(
      true,
    );
    expect(diagnostics.some((item) => item.rule === RULE.forbiddenMuiXPackage)).toBe(true);
    expect(checkBundleGraph(REPO_ROOT).every((issue) => issue.entryId === "INV-09" || issue.code !== "forbidden-bundle")).toBe(
      true,
    );
  });

  test("V1-EXPORT-SURFACE compares package exports, runtime keys, and declarations", () => {
    const issues = checkExportSurfaces(REPO_ROOT);
    expect(issues.filter((issue) => issue.code === "export-mismatch" && issue.message.includes("does not exist"))).toEqual(
      [],
    );
  });
});
