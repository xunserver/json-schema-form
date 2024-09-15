import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { RULE } from "../../tools/architecture-check/policy.js";
import { REPO_ROOT, copyWorkspacePackages, makeTempDir, readJson, writeJson, writeText } from "../lib/fs.js";
import { runBoundaryCheck, runTsc } from "../lib/process.js";

type Manifest = {
  name: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function copyRepoPackages(): string {
  const root = makeTempDir("form-fault-");
  copyWorkspacePackages(root);
  return root;
}

function mutateManifest(workspaceRoot: string, packageDir: string, mutate: (manifest: Manifest) => void): void {
  const manifestPath = path.join(workspaceRoot, "packages", packageDir, "package.json");
  const manifest = readJson<Manifest>(manifestPath);
  mutate(manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

describe("fault injection commands", () => {
  test("forbidden Core import fails the boundary command", () => {
    const root = copyRepoPackages();
    writeText(path.join(root, "packages", "core", "src", "leak.ts"), 'import "ajv";\n');

    const result = runBoundaryCheck(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("@form/core");
    expect(result.stderr).toContain("ajv");
    expect(result.stderr).toContain(RULE.forbiddenCorePackage);
  });

  test("reverse dependency fails the boundary command", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "core", (manifest) => {
      manifest.dependencies = { "@form/vue": "workspace:*" };
    });

    const result = runBoundaryCheck(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("@form/core");
    expect(result.stderr).toContain("@form/vue");
    expect(result.stderr).toContain(RULE.reverseDependency);
  });

  test("cross-framework dependency fails the boundary command", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "mui", (manifest) => {
      manifest.dependencies = {
        ...manifest.dependencies,
        "@form/element-plus": "workspace:*",
      };
    });

    const result = runBoundaryCheck(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("@form/mui");
    expect(result.stderr).toContain("@form/element-plus");
    expect(result.stderr).toContain(RULE.crossFrameworkDependency);
  });

  test("bundled host peer fails the boundary command", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "react", (manifest) => {
      manifest.dependencies = {
        ...manifest.dependencies,
        react: "^19.0.0",
      };
    });

    const result = runBoundaryCheck(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("@form/react");
    expect(result.stderr).toContain("react");
    expect(result.stderr).toContain(RULE.hostPeerPlacement);
  });

  test("DOM global fails Core production typecheck command", () => {
    const root = makeTempDir("form-dom-");
    writeText(path.join(root, "uses-document.ts"), "export const node = document.body;\n");
    writeJson(path.join(root, "tsconfig.json"), {
      compilerOptions: {
        strict: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2022",
        lib: ["ES2022"],
        types: [],
        noEmit: true,
      },
      files: ["./uses-document.ts"],
    });

    const result = runTsc(path.join(root, "tsconfig.json"));
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/Cannot find name 'document'/);
  });

  test("internal deep import fails consumer typecheck command", () => {
    const result = runTsc(path.join(REPO_ROOT, "tests/contracts/negative/deep-import.tsconfig.json"));
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/Cannot find module|has no exported member|TS2307|TS2305/);
  });

  test("unexpected Core directory fails the boundary command", () => {
    const root = copyRepoPackages();
    fs.mkdirSync(path.join(root, "packages", "core", "src", "utils"));
    writeText(path.join(root, "packages", "core", "src", "utils", "helper.ts"), "export const n = 1;\n");

    const result = runBoundaryCheck(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("utils");
    expect(result.stderr).toContain(RULE.coreLayout);
  });

  test("missing Core domain directory fails the boundary command", () => {
    const root = copyRepoPackages();
    fs.rmSync(path.join(root, "packages", "core", "src", "engine"), { recursive: true, force: true });

    const result = runBoundaryCheck(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("engine");
    expect(result.stderr).toContain(RULE.coreLayout);
  });
});
