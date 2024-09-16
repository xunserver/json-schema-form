import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.js";

describe("vue + element-plus architecture matrix", () => {
  test("does not implement React, Ant Design, or a Universal Renderer", () => {
    const vue = fs.readFileSync(path.join(REPO_ROOT, "packages/vue/src/index.ts"), "utf8");
    const elementPlus = fs.readFileSync(path.join(REPO_ROOT, "packages/adapter/element-plus/src/index.ts"), "utf8");
    expect(vue).not.toMatch(/ReactUIAdapter|UniversalRenderer|@xunserver-jsf\/react|@xunserver-jsf\/antd/);
    expect(elementPlus).not.toMatch(/@xunserver-jsf\/react|@xunserver-jsf\/antd|ReactUIAdapter/);
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
});
