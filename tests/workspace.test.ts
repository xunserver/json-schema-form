import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT, readJson } from "./lib/fs.js";

const FIRST_PARTY_PACKAGES = [
  "@xunserver-jsf/core",
  "@xunserver-jsf/validator-ajv",
  "@xunserver-jsf/vue",
  "@xunserver-jsf/react",
  "@xunserver-jsf/element-plus",
  "@xunserver-jsf/antd",
  "@xunserver-jsf/arco-vue",
  "@xunserver-jsf/arco-react",
  "@xunserver-jsf/shadcn",
] as const;

describe("workspace contract", () => {
  test("root package is private and pins pnpm", () => {
    const rootPackage = readJson<{
      private?: boolean;
      packageManager?: string;
      type?: string;
    }>(path.join(REPO_ROOT, "package.json"));

    expect(rootPackage.private).toBe(true);
    expect(rootPackage.type).toBe("module");
    expect(rootPackage.packageManager).toMatch(/^pnpm@/);
  });

  test("pnpm workspace and shared TypeScript base config exist", () => {
    const workspace = fs.readFileSync(path.join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8");
    const baseConfig = readJson<{ compilerOptions?: { strict?: boolean } }>(
      path.join(REPO_ROOT, "tsconfig.base.json"),
    );
    const rootConfig = readJson<{ references?: { path: string }[] }>(
      path.join(REPO_ROOT, "tsconfig.json"),
    );

    expect(workspace).toContain("packages/*");
    expect(baseConfig.compilerOptions?.strict).toBe(true);
    expect(rootConfig.references?.map((reference) => reference.path)).toEqual([
      "./packages/core",
      "./packages/validator-ajv",
      "./packages/vue",
      "./packages/react",
      "./packages/adapter/element-plus",
      "./packages/adapter/antd",
      "./packages/adapter/arco-vue",
      "./packages/adapter/arco-react",
      "./packages/adapter/shadcn",
    ]);
  });

  test("pnpm enumerates exactly the first-party packages", () => {
    const result = spawnSync("pnpm", ["recursive", "list", "--depth", "-1", "--json"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const listed = JSON.parse(result.stdout) as { name: string; path: string }[];
    const firstParty = listed
      .filter((pkg) => pkg.path.startsWith(path.join(REPO_ROOT, "packages") + path.sep))
      .map((pkg) => pkg.name)
      .sort();

    expect(firstParty).toEqual([...FIRST_PARTY_PACKAGES].sort());
    expect(listed.some((pkg) => pkg.name === "json-schema-form" && pkg.path === REPO_ROOT)).toBe(true);
  });

  test("workspace lockfile is present", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "pnpm-lock.yaml"))).toBe(true);
  });
});
