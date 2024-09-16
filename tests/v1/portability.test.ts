import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import { REPO_ROOT, readJson } from "../lib/fs.js";

const FORBIDDEN = [
  "vue",
  "react",
  "react-dom",
  "element-plus",
  "antd",
  "@arco-design/web-vue",
  "@arco-design/web-react",
  "ajv",
];

describe("v1 core portability", () => {
  test("V1-PORTABILITY-DEPS keeps browser runners out of product packages", () => {
    const root = readJson<{ devDependencies?: Record<string, string> }>(path.join(REPO_ROOT, "package.json"));
    expect(root.devDependencies?.playwright ?? root.devDependencies?.["@vitest/browser"]).toBeDefined();
    for (const directory of [
      "core",
      "validator-ajv",
      "vue",
      "react",
      "adapter/element-plus",
      "adapter/antd",
      "adapter/arco-vue",
      "adapter/arco-react",
      "adapter/shadcn",
    ]) {
      const manifest = readJson<{
        dependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      }>(path.join(REPO_ROOT, "packages", directory, "package.json"));
      expect(manifest.dependencies?.playwright).toBeUndefined();
      expect(manifest.dependencies?.["@vitest/browser"]).toBeUndefined();
    }
  });

  test("V1-PORTABILITY-NODE loads built Core exports without host libraries", async () => {
    const core = await import("@xunserver-jsf/core");
    const form = core.createForm(
      core.compileForm(core.defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model,
      { initialValues: { name: "Ada" } },
    );
    expect(form.getValue("name")).toBe("Ada");
    const declaration = fs.readFileSync(path.join(REPO_ROOT, "packages/core/dist/index.d.ts"), "utf8");
    for (const name of FORBIDDEN) {
      expect(declaration).not.toContain(`from "${name}"`);
    }
    const tsconfig = readJson<{ compilerOptions?: { lib?: string[] } }>(path.join(REPO_ROOT, "packages/core/tsconfig.json"));
    expect(tsconfig.compilerOptions?.lib).toEqual(["ES2022"]);
    expect(typeof document).toBe("undefined");
    void compileForm;
    void createForm;
    void defineForm;
  });
});
