import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.js";

describe("react architecture matrix", () => {
  test("does not implement Vue protocols, Universal Renderer, or date-picker libraries", () => {
    const react = fs.readFileSync(path.join(REPO_ROOT, "packages/react/src/index.ts"), "utf8");
    const antd = fs.readFileSync(path.join(REPO_ROOT, "packages/adapter/antd/src/index.ts"), "utf8");
    expect(react).toMatch(/FormRenderer/);
    expect(react).toMatch(/defineReactUIAdapter/);
    expect(react).not.toMatch(/VueUIAdapter|UniversalRenderer|@form\/vue|@form\/element-plus/);
    expect(antd).toMatch(/antdAdapter/);
    expect(antd).not.toMatch(/@form\/vue|@form\/element-plus|@mui\/x-date-pickers|UniversalRenderer/);
    const shadcn = fs.readFileSync(path.join(REPO_ROOT, "packages/adapter/shadcn/src/index.ts"), "utf8");
    expect(shadcn).toMatch(/createShadcnAdapter/);
    expect(shadcn).not.toMatch(/shadcnAdapter[^C]|@form\/vue|@base-ui\/react|UniversalRenderer/);
  });

  test("records Core owner ports as already published", () => {
    const runtime = fs.readFileSync(path.join(REPO_ROOT, "packages/core/dist/runtime/index.d.ts"), "utf8");
    const extension = fs.readFileSync(path.join(REPO_ROOT, "packages/core/dist/extension/index.d.ts"), "utf8");
    expect(runtime).toContain("getRenderScope");
    expect(runtime).toContain("RenderScope");
    expect(runtime).toContain("InstanceBinding");
    expect(extension).toContain("defineWidget");
    const contracts = fs.readFileSync(
      path.join(REPO_ROOT, "packages/core/dist/runtime/form/contracts.d.ts"),
      "utf8",
    );
    expect(contracts).toContain("blur");
    expect(contracts).toContain("required");
    expect(contracts).toContain("collapsed");
    expect(contracts).toContain("activeTab");
  });

  test("package sources do not import Vue or MUI X", () => {
    const files = collect(
      path.join(REPO_ROOT, "packages/react/src"),
      path.join(REPO_ROOT, "packages/adapter/antd/src"),
      path.join(REPO_ROOT, "packages/adapter/shadcn/src"),
    );
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/from ["']vue["']|from ["']@form\/vue["']|from ["']@mui\/x-date-pickers["']/);
    }
  });
});

function collect(...roots: string[]): string[] {
  const files: string[] = [];
  for (const root of roots) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "test-utils") {
          continue;
        }
        files.push(...collect(full));
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        if (!entry.name.includes(".test.")) {
          files.push(full);
        }
      }
    }
  }
  return files;
}
