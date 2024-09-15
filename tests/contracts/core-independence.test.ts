import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.ts";
import { formatDiagnostics, loadTsconfig, typecheckFiles, typecheckProject } from "../lib/typecheck.ts";

describe("Core independence", () => {
  test("typechecks Core production sources without DOM or test globals", () => {
    const diagnostics = typecheckProject(path.join(REPO_ROOT, "packages/core/tsconfig.json"));
    expect(formatDiagnostics(diagnostics), formatDiagnostics(diagnostics)).toBe("");
  });

  test("DOM globals are an unavailable contract under the Core production lib", () => {
    const options = loadTsconfig(path.join(REPO_ROOT, "packages/core/tsconfig.json")).options;
    const diagnostics = typecheckFiles(
      [path.join(REPO_ROOT, "tests/contracts/core-dom/uses-document.ts")],
      {
        ...options,
        noEmit: true,
        composite: false,
        types: [],
        lib: ["es2022"],
      },
    );

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(formatDiagnostics(diagnostics)).toMatch(/Cannot find name 'document'/);
  });

  test("generated Core declarations do not reference forbidden host or validator packages", () => {
    const files = [
      path.join(REPO_ROOT, "packages/core/dist/index.d.ts"),
      path.join(REPO_ROOT, "packages/core/dist/extension/index.d.ts"),
      path.join(REPO_ROOT, "packages/core/dist/runtime/index.d.ts"),
    ];

    for (const file of files) {
      const declaration = fs.readFileSync(file, "utf8");
      expect(declaration).not.toMatch(/from ["']vue["']/);
      expect(declaration).not.toMatch(/from ["']react["']/);
      expect(declaration).not.toMatch(/from ["']ajv["']/);
      expect(declaration).not.toMatch(/from ["']element-plus["']/);
      expect(declaration).not.toMatch(/from ["']@mui\/material["']/);
    }
  });
});
