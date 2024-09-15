import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.js";

function resolveWithNode(specifier: string): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `console.log(import.meta.resolve(${JSON.stringify(specifier)}));`,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
    },
  );

  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

describe("runtime export resolution", () => {
  test("resolves declared Core entries through package exports", () => {
    expect(resolveWithNode("@form/core").stdout.trim()).toMatch(/packages\/core\/dist\/index\.js$/);
    expect(resolveWithNode("@form/core/runtime").stdout.trim()).toMatch(
      /packages\/core\/dist\/runtime\/index\.js$/,
    );
    expect(resolveWithNode("@form/core/extension").stdout.trim()).toMatch(
      /packages\/core\/dist\/extension\/index\.js$/,
    );
  });

  test("imports application and extension factories through package exports", async () => {
    const core = await import("@form/core");
    const extension = await import("@form/core/extension");

    expect(typeof core.defineForm).toBe("function");
    expect(typeof core.compileForm).toBe("function");
    expect(typeof core.createForm).toBe("function");
    expect(typeof core.createFormEngine).toBe("function");
    expect("definePlugin" in core).toBe(false);
    expect("defineWidget" in core).toBe(false);
    expect("createFormEnvironment" in core).toBe(false);
    expect("defineRuleFunction" in core).toBe(false);
    expect("valueSelector" in core).toBe(false);
    expect(typeof extension.definePlugin).toBe("function");
    expect(typeof extension.defineWidget).toBe("function");
    expect(typeof extension.createFormEnvironment).toBe("function");
    expect(typeof extension.defineRuleFunction).toBe("function");
    expect(typeof extension.defineValidator).toBe("function");
    expect("defineValidator" in core).toBe(false);
    expect(extension.CORE_EXTENSION_PROTOCOL).toEqual({ major: 1, minor: 0 });
  });

  test("resolves validator-ajv through package exports", () => {
    expect(resolveWithNode("@form/validator-ajv").stdout.trim()).toMatch(
      /packages\/validator-ajv\/dist\/index\.js$/,
    );
  });

  test("rejects an undeclared Core deep path at runtime", () => {
    const result = resolveWithNode("@form/core/src/diagnostic/index.js");
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(
      /Package subpath|ERR_PACKAGE_PATH_NOT_EXPORTED/,
    );
  });
});
