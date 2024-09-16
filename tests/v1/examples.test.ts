import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.js";
import { runNodeProcess } from "../lib/process.js";

describe("v1 examples", () => {
  test("V1-EXAMPLES builds and smokes both public example apps", () => {
    const vueSrc = fs.readFileSync(path.join(REPO_ROOT, "examples/vue-element-plus/src/definition.ts"), "utf8");
    const reactSrc = fs.readFileSync(path.join(REPO_ROOT, "examples/react-mui/src/definition.ts"), "utf8");
    expect(vueSrc).not.toMatch(/@form\/vue\/src/);
    expect(reactSrc).not.toMatch(/@form\/react\/src/);
    expect(vueSrc).toContain("company.currency");
    expect(reactSrc).toContain("company.currency");
    expect(fs.readFileSync(path.join(REPO_ROOT, "examples/react-mui/package.json"), "utf8")).not.toContain("@mui/x-");
    const vue = runNodeProcess("pnpm", ["example:vue"]);
    expect(vue.status, vue.stderr).toBe(0);
    const react = runNodeProcess("pnpm", ["example:react"]);
    expect(react.status, react.stderr).toBe(0);
  });
});
