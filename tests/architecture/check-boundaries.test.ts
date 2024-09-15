import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { checkArchitecture } from "../../tools/architecture-check/check.ts";
import { ALLOWED_EDGES, RULE } from "../../tools/architecture-check/policy.ts";
import { REPO_ROOT, copyWorkspacePackages, makeTempDir, readJson, writeText } from "../lib/fs.ts";

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
      "validator-ajv": 'import type { FormDefinition } from "@form/core";\nexport type Probe = FormDefinition;\n',
      vue: 'import type { FormDefinition } from "@form/core";\nexport type Probe = FormDefinition;\n',
      react: 'import type { FormDefinition } from "@form/core";\nexport type Probe = FormDefinition;\n',
      "element-plus":
        'import type { FormDefinition } from "@form/core";\nimport "@form/vue";\nexport type Probe = FormDefinition;\n',
      mui: 'import type { FormDefinition } from "@form/core";\nimport "@form/react";\nexport type Probe = FormDefinition;\n',
    };

    for (const [directory, source] of Object.entries(importFiles)) {
      writeText(path.join(root, "packages", directory, "src", "index.ts"), source);
    }

    expect(checkArchitecture(root)).toEqual([]);
    expect(ALLOWED_EDGES["@form/validator-ajv"]).toEqual(["@form/core"]);
    expect(ALLOWED_EDGES["@form/vue"]).toEqual(["@form/core"]);
    expect(ALLOWED_EDGES["@form/react"]).toEqual(["@form/core"]);
    expect(ALLOWED_EDGES["@form/element-plus"]).toEqual(["@form/core", "@form/vue"]);
    expect(ALLOWED_EDGES["@form/mui"]).toEqual(["@form/core", "@form/react"]);
  });

  test("rejects a reverse Core -> Vue dependency", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "core", (manifest) => {
      manifest.dependencies = { "@form/vue": "workspace:*" };
    });
    writeText(path.join(root, "packages", "core", "src", "leak.ts"), 'import "@form/vue";\n');

    const diagnostics = checkArchitecture(root);
    expect(diagnostics.some((diagnostic) => diagnostic.rule === RULE.reverseDependency)).toBe(true);
    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.sourcePackage === "@form/core" && diagnostic.targetPackage === "@form/vue",
      ),
    ).toBe(true);
  });

  test("rejects a cross-framework Adapter dependency", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "mui", (manifest) => {
      manifest.dependencies = {
        ...manifest.dependencies,
        "@form/vue": "workspace:*",
      };
    });

    const diagnostics = checkArchitecture(root);
    expect(diagnostics.some((diagnostic) => diagnostic.rule === RULE.crossFrameworkDependency)).toBe(true);
    expect(
      diagnostics.some(
        (diagnostic) => diagnostic.sourcePackage === "@form/mui" && diagnostic.targetPackage === "@form/vue",
      ),
    ).toBe(true);
  });

  test("rejects an undeclared but otherwise legal import", () => {
    const root = copyRepoPackages();
    mutateManifest(root, "element-plus", (manifest) => {
      delete manifest.dependencies?.["@form/core"];
    });
    writeText(
      path.join(root, "packages", "element-plus", "src", "index.ts"),
      'import type { FormDefinition } from "@form/core";\nexport type Probe = FormDefinition;\n',
    );

    const diagnostics = checkArchitecture(root);
    expect(diagnostics.some((diagnostic) => diagnostic.rule === RULE.undeclaredDependency)).toBe(true);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.sourcePackage === "@form/element-plus" && diagnostic.targetPackage === "@form/core",
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
        (diagnostic) => diagnostic.sourcePackage === "@form/vue" && diagnostic.targetPackage === "@form/core",
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
      diagnostics.some((diagnostic) => diagnostic.sourcePackage === "@form/vue" && diagnostic.targetPackage === "vue"),
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
});
