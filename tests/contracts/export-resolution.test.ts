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
    expect(resolveWithNode("@xunserver-jsf/core").stdout.trim()).toMatch(/packages\/core\/dist\/index\.js$/);
    expect(resolveWithNode("@xunserver-jsf/core/runtime").stdout.trim()).toMatch(
      /packages\/core\/dist\/runtime\/index\.js$/,
    );
    expect(resolveWithNode("@xunserver-jsf/core/extension").stdout.trim()).toMatch(
      /packages\/core\/dist\/extension\/index\.js$/,
    );
  });

  test("imports application and extension factories through package exports", async () => {
    const core = await import("@xunserver-jsf/core");
    const extension = await import("@xunserver-jsf/core/extension");

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
    expect(resolveWithNode("@xunserver-jsf/validator-ajv").stdout.trim()).toMatch(
      /packages\/validator-ajv\/dist\/index\.js$/,
    );
  });

  test("rejects an undeclared Core deep path at runtime", () => {
    const result = resolveWithNode("@xunserver-jsf/core/src/diagnostic/index.js");
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toMatch(
      /Package subpath|ERR_PACKAGE_PATH_NOT_EXPORTED/,
    );
  });

  test("resolves Vue, React, and UI adapter root entries and rejects deep paths", () => {
    expect(resolveWithNode("@xunserver-jsf/vue").stdout.trim()).toMatch(/packages\/vue\/dist\/index\.js$/);
    expect(resolveWithNode("@xunserver-jsf/element-plus").stdout.trim()).toMatch(
      /packages\/adapter\/element-plus\/dist\/index\.js$/,
    );
    expect(resolveWithNode("@xunserver-jsf/react").stdout.trim()).toMatch(/packages\/react\/dist\/index\.js$/);
    expect(resolveWithNode("@xunserver-jsf/antd").stdout.trim()).toMatch(/packages\/adapter\/antd\/dist\/index\.js$/);
    expect(resolveWithNode("@xunserver-jsf/shadcn").stdout.trim()).toMatch(/packages\/adapter\/shadcn\/dist\/index\.js$/);
    const vueDeep = resolveWithNode("@xunserver-jsf/vue/src/renderer/FormRenderer.js");
    expect(vueDeep.status).not.toBe(0);
    const plusDeep = resolveWithNode("@xunserver-jsf/element-plus/src/widgets/mapper.js");
    expect(plusDeep.status).not.toBe(0);
    const reactDeep = resolveWithNode("@xunserver-jsf/react/src/renderer/FormRenderer.js");
    expect(reactDeep.status).not.toBe(0);
    const antdDeep = resolveWithNode("@xunserver-jsf/antd/src/widgets/mapper.js");
    expect(antdDeep.status).not.toBe(0);
    const shadcnDeep = resolveWithNode("@xunserver-jsf/shadcn/src/widgets/mapper.js");
    expect(shadcnDeep.status).not.toBe(0);
  });
});
