import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.js";
import { runNodeProcess } from "../lib/process.js";

const FORBIDDEN = [
  "@xunserver-jsf/compiler",
  "@xunserver-jsf/runtime",
  "@xunserver-jsf/schema",
  "@xunserver-jsf/rules",
  "@xunserver-jsf/validation",
  "@xunserver-jsf/ant-design-vue",
  "@xunserver-jsf/antd-react",
];

describe("v1 deferred absence", () => {
  test("V1-DEFERRED-ABSENCE keeps deferred capabilities out of exports and docs", () => {
    const rootIndex = fs.readFileSync(path.join(REPO_ROOT, "packages/core/src/index.ts"), "utf8");
    expect(rootIndex).not.toMatch(/mutateCompiledModel|addLifecycleHook|createNestedStore|DevToolsGraph/);
    const readme = fs.readFileSync(path.join(REPO_ROOT, "README.md"), "utf8");
    expect(readme.toLowerCase()).not.toContain("universal renderer");
    // Allow naming deferred items (e.g. "async rule / 内置远程 DataSource") in the deferred list,
    // but reject delivery-style claims that present them as shipped APIs.
    expect(readme).not.toMatch(/provides?\s+async\s+rule/i);
    expect(readme).not.toMatch(/supports?\s+async\s+rule/i);
    expect(readme).not.toMatch(/delivered\s+async\s+rule/i);
    const workspace = fs.readFileSync(path.join(REPO_ROOT, "docs/workspace.md"), "utf8");
    expect(workspace).not.toContain("@xunserver-jsf/compiler");
    for (const name of FORBIDDEN) {
      const resolved = runNodeProcess(process.execPath, [
        "--input-type=module",
        "-e",
        `import.meta.resolve(${JSON.stringify(name)}).then(() => {}, () => {})`,
      ]);
      expect(`${resolved.stdout}\n${resolved.stderr}`).not.toMatch(new RegExp(`${name}/dist`));
    }
    expect(fs.existsSync(path.join(REPO_ROOT, "packages/compiler"))).toBe(false);
  });

  test("V1-EXPORT-DEEP-DENY rejects undeclared deep imports", () => {
    const result = runNodeProcess(process.execPath, [
      "--input-type=module",
      "-e",
      'import.meta.resolve("@xunserver-jsf/core/src/runtime/form/form-runtime.js").then((url) => console.log(url), (error) => { console.error(error.code); process.exit(1); })',
    ]);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(/ERR_PACKAGE_PATH_NOT_EXPORTED|Package subpath/);
  });
});
