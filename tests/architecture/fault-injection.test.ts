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
    expect(result.stderr).toContain("@xunserver-jsf/core");
    expect(result.stderr).toContain("ajv");
    expect(result.stderr).toContain(RULE.forbiddenCorePackage);
  });

  test("reverse dependency fails the boundary command", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "core", (manifest) => {
      manifest.dependencies = { "@xunserver-jsf/vue": "workspace:*" };
    });

    const result = runBoundaryCheck(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("@xunserver-jsf/core");
    expect(result.stderr).toContain("@xunserver-jsf/vue");
    expect(result.stderr).toContain(RULE.reverseDependency);
  });

  test("cross-framework dependency fails the boundary command", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "adapter/antd", (manifest) => {
      manifest.dependencies = {
        ...manifest.dependencies,
        "@xunserver-jsf/element-plus": "workspace:*",
      };
    });

    const result = runBoundaryCheck(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("@xunserver-jsf/antd");
    expect(result.stderr).toContain("@xunserver-jsf/element-plus");
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
    expect(result.stderr).toContain("@xunserver-jsf/react");
    expect(result.stderr).toContain("react");
    expect(result.stderr).toContain(RULE.hostPeerPlacement);
  });

  test("MUI X date pickers fail the boundary command", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "adapter/antd", (manifest) => {
      manifest.dependencies = {
        ...manifest.dependencies,
        "@mui/x-date-pickers": "^8.0.0",
      };
    });

    const result = runBoundaryCheck(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("@xunserver-jsf/antd");
    expect(result.stderr).toContain("@mui/x-date-pickers");
    expect(result.stderr).toContain(RULE.forbiddenMuiXPackage);
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

  test("Vue, React, Element Plus and Ant Design deep imports fail consumer typecheck", () => {
    const vue = runTsc(path.join(REPO_ROOT, "tests/contracts/negative/vue-deep-import.tsconfig.json"));
    expect(vue.status).not.toBe(0);
    expect(`${vue.stdout}\n${vue.stderr}`).toMatch(/Cannot find module|TS2307/);
    const plus = runTsc(path.join(REPO_ROOT, "tests/contracts/negative/element-plus-deep-import.tsconfig.json"));
    expect(plus.status).not.toBe(0);
    expect(`${plus.stdout}\n${plus.stderr}`).toMatch(/Cannot find module|TS2307/);
    const react = runTsc(path.join(REPO_ROOT, "tests/contracts/negative/react-deep-import.tsconfig.json"));
    expect(react.status).not.toBe(0);
    expect(`${react.stdout}\n${react.stderr}`).toMatch(/Cannot find module|TS2307/);
    const antd = runTsc(path.join(REPO_ROOT, "tests/contracts/negative/antd-deep-import.tsconfig.json"));
    expect(antd.status).not.toBe(0);
    expect(`${antd.stdout}\n${antd.stderr}`).toMatch(/Cannot find module|TS2307/);
    const shadcn = runTsc(path.join(REPO_ROOT, "tests/contracts/negative/shadcn-deep-import.tsconfig.json"));
    expect(shadcn.status).not.toBe(0);
    expect(`${shadcn.stdout}\n${shadcn.stderr}`).toMatch(/Cannot find module|TS2307/);
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
