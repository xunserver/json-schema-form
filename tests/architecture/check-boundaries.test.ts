import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { checkArchitecture } from "../../tools/architecture-check/check.js";
import { ALLOWED_EDGES, RULE } from "../../tools/architecture-check/policy.js";
import { REPO_ROOT, copyWorkspacePackages, makeTempDir, readJson, writeText } from "../lib/fs.js";

type Manifest = {
  name: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function mutateManifest(workspaceRoot: string, packageDir: string, mutate: (manifest: Manifest) => void): void {
  const manifestPath = path.join(workspaceRoot, "packages", packageDir, "package.json");
  const manifest = readJson<Manifest>(manifestPath);
  mutate(manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function copyRepoPackages(): string {
  const root = makeTempDir("form-architecture-");
  copyWorkspacePackages(root);
  return root;
}

describe("architecture checker", () => {
  test("accepts the canonical workspace graph", () => {
    const diagnostics = checkArchitecture(REPO_ROOT);
    expect(diagnostics).toEqual([]);
  });

  test("accepts every allowlisted first-party edge as a source import", () => {
    const root = copyRepoPackages();

    const importFiles: Record<string, string> = {
      "validator-ajv": 'import type { FormDefinition } from "@xunserver-jsf/core";\nexport type Probe = FormDefinition;\n',
      vue: 'import type { FormDefinition } from "@xunserver-jsf/core";\nexport type Probe = FormDefinition;\n',
      react: 'import type { FormDefinition } from "@xunserver-jsf/core";\nexport type Probe = FormDefinition;\n',
      "adapter/element-plus":
        'import type { FormDefinition } from "@xunserver-jsf/core";\nimport "@xunserver-jsf/vue";\nexport type Probe = FormDefinition;\n',
      "adapter/antd":
        'import type { FormDefinition } from "@xunserver-jsf/core";\nimport "@xunserver-jsf/react";\nexport type Probe = FormDefinition;\n',
    };

    for (const [directory, source] of Object.entries(importFiles)) {
      writeText(path.join(root, "packages", directory, "src", "index.ts"), source);
    }

    expect(checkArchitecture(root)).toEqual([]);
    expect(ALLOWED_EDGES["@xunserver-jsf/validator-ajv"]).toEqual(["@xunserver-jsf/core"]);
    expect(ALLOWED_EDGES["@xunserver-jsf/vue"]).toEqual(["@xunserver-jsf/core"]);
    expect(ALLOWED_EDGES["@xunserver-jsf/react"]).toEqual(["@xunserver-jsf/core"]);
    expect(ALLOWED_EDGES["@xunserver-jsf/element-plus"]).toEqual(["@xunserver-jsf/core", "@xunserver-jsf/vue"]);
    expect(ALLOWED_EDGES["@xunserver-jsf/antd"]).toEqual(["@xunserver-jsf/core", "@xunserver-jsf/react"]);
    expect(ALLOWED_EDGES["@xunserver-jsf/arco-vue"]).toEqual(["@xunserver-jsf/core", "@xunserver-jsf/vue"]);
    expect(ALLOWED_EDGES["@xunserver-jsf/arco-react"]).toEqual(["@xunserver-jsf/core", "@xunserver-jsf/react"]);
    expect(ALLOWED_EDGES["@xunserver-jsf/shadcn"]).toEqual(["@xunserver-jsf/core", "@xunserver-jsf/react"]);
  });

  test("rejects a reverse Core -> Vue dependency", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "core", (manifest) => {
      manifest.dependencies = { "@xunserver-jsf/vue": "workspace:*" };
    });
    writeText(path.join(root, "packages", "core", "src", "leak.ts"), 'import "@xunserver-jsf/vue";\n');

    const diagnostics = checkArchitecture(root);
    expect(diagnostics.some((diagnostic) => diagnostic.rule === RULE.reverseDependency)).toBe(true);
    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.sourcePackage === "@xunserver-jsf/core" && diagnostic.targetPackage === "@xunserver-jsf/vue",
      ),
    ).toBe(true);
  });

  test("rejects a cross-framework Adapter dependency", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "adapter/antd", (manifest) => {
      manifest.dependencies = {
        ...manifest.dependencies,
        "@xunserver-jsf/vue": "workspace:*",
      };
    });

    const diagnostics = checkArchitecture(root);
    expect(diagnostics.some((diagnostic) => diagnostic.rule === RULE.crossFrameworkDependency)).toBe(true);
    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.sourcePackage === "@xunserver-jsf/antd" && diagnostic.targetPackage === "@xunserver-jsf/vue",
      ),
    ).toBe(true);
  });

  test("rejects an undeclared but otherwise legal import", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "adapter/element-plus", (manifest) => {
      delete manifest.dependencies?.["@xunserver-jsf/core"];
    });
    writeText(
      path.join(root, "packages", "adapter", "element-plus", "src", "index.ts"),
      'import type { FormDefinition } from "@xunserver-jsf/core";\nexport type Probe = FormDefinition;\n',
    );

    const diagnostics = checkArchitecture(root);
    expect(diagnostics.some((diagnostic) => diagnostic.rule === RULE.undeclaredDependency)).toBe(true);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.sourcePackage === "@xunserver-jsf/element-plus" && diagnostic.targetPackage === "@xunserver-jsf/core",
      ),
    ).toBe(true);
  });

  test("rejects a relative cross-package import", () => {
    const root = copyRepoPackages();
    writeText(
      path.join(root, "packages", "vue", "src", "index.ts"),
      'export type { FormDefinition } from "../../core/src/index.ts";\n',
    );

    const diagnostics = checkArchitecture(root);
    expect(diagnostics.some((diagnostic) => diagnostic.rule === RULE.relativeCrossPackageImport)).toBe(true);
    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.sourcePackage === "@xunserver-jsf/vue" && diagnostic.targetPackage === "@xunserver-jsf/core",
      ),
    ).toBe(true);
  });

  test("rejects host frameworks bundled as production dependencies", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "vue", (manifest) => {
      manifest.dependencies = {
        ...manifest.dependencies,
        vue: "^3.5.0",
      };
    });

    const diagnostics = checkArchitecture(root);
    expect(diagnostics.some((diagnostic) => diagnostic.rule === RULE.hostPeerPlacement)).toBe(true);
    expect(
      diagnostics.some((diagnostic) => diagnostic.sourcePackage === "@xunserver-jsf/vue" && diagnostic.targetPackage === "vue"),
    ).toBe(true);
  });

  test("rejects forbidden Core package dependencies and imports", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "core", (manifest) => {
      manifest.dependencies = { ajv: "^8.17.0" };
    });
    writeText(path.join(root, "packages", "core", "src", "leak.ts"), 'import "vue";\nimport "react";\n');

    const diagnostics = checkArchitecture(root);
    const coreForbidden = diagnostics.filter((diagnostic) => diagnostic.rule === RULE.forbiddenCorePackage);
    expect(coreForbidden.length).toBeGreaterThanOrEqual(3);
    expect(coreForbidden.map((diagnostic) => diagnostic.targetPackage).sort()).toEqual(
      expect.arrayContaining(["ajv", "react", "vue"]),
    );
  });

  test("rejects AJV imports outside validator-ajv", () => {
    const root = copyRepoPackages();
    writeText(path.join(root, "packages", "vue", "src", "index.ts"), 'import "ajv";\n');
    mutateManifest(root, "react", (manifest) => {
      manifest.dependencies = { ...manifest.dependencies, ajv: "^8.17.0" };
    });

    const diagnostics = checkArchitecture(root);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.rule === RULE.forbiddenCorePackage &&
          diagnostic.sourcePackage === "@xunserver-jsf/vue" &&
          diagnostic.targetPackage === "ajv",
      ),
    ).toBe(true);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.rule === RULE.forbiddenCorePackage &&
          diagnostic.sourcePackage === "@xunserver-jsf/react" &&
          diagnostic.targetPackage === "ajv",
      ),
    ).toBe(true);
  });

  test("rejects an unexpected Core top-level directory", () => {
    const root = copyRepoPackages();
    fs.mkdirSync(path.join(root, "packages", "core", "src", "utils"));
    writeText(path.join(root, "packages", "core", "src", "utils", "helper.ts"), "export const n = 1;\n");

    const diagnostics = checkArchitecture(root);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.rule === RULE.coreLayout &&
          diagnostic.file?.includes(`${path.sep}utils`) &&
          diagnostic.message.includes("utils"),
      ),
    ).toBe(true);
  });

  test("rejects a missing Core domain directory", () => {
    const root = copyRepoPackages();
    fs.rmSync(path.join(root, "packages", "core", "src", "widget"), { recursive: true, force: true });

    const diagnostics = checkArchitecture(root);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.rule === RULE.coreLayout &&
          diagnostic.file?.includes(`${path.sep}widget`) &&
          diagnostic.message.includes("widget"),
      ),
    ).toBe(true);
  });
});
