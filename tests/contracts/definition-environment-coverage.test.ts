import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.ts";

const SCENARIOS: readonly { spec: string; scenario: string; files: readonly string[] }[] = [
  {
    spec: "form-definition-authoring",
    scenario: "声明最小 Definition",
    files: ["packages/core/type-tests/definition.ts", "packages/core/type-tests/define-form.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "声明完整 Definition",
    files: ["packages/core/type-tests/definition.ts", "packages/core/type-tests/define-form.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "接受 boolean schema 边界",
    files: ["packages/core/type-tests/definition.ts", "packages/core/type-tests/define-form.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "通过 defineForm 保留 Definition",
    files: [
      "packages/core/src/definition/define-form.test.ts",
      "packages/core/type-tests/define-form.ts",
    ],
  },
  {
    spec: "form-definition-authoring",
    scenario: "重复 authoring 不产生跨调用状态",
    files: ["packages/core/src/definition/define-form.test.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "拒绝 Runtime state 成员",
    files: ["packages/core/type-tests/definition.ts", "packages/core/type-tests/define-form.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "拒绝 Renderer 与 Validator 实现成员",
    files: ["packages/core/type-tests/definition.ts", "packages/core/type-tests/define-form.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "UI 字段使用 ModelPath",
    files: ["packages/core/type-tests/definition.ts", "packages/core/type-tests/define-form.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "声明包含多类 contribution 的 Plugin",
    files: [
      "packages/core/src/extension/define-plugin.test.ts",
      "packages/core/type-tests/extension-plugin.ts",
    ],
  },
  {
    spec: "core-plugin-environment",
    scenario: "拒绝 framework binding",
    files: [
      "packages/core/type-tests/extension-plugin.ts",
      "packages/core/src/extension/built-in.test.ts",
    ],
  },
  {
    spec: "core-plugin-environment",
    scenario: "构建显式 Environment",
    files: ["packages/core/src/extension/create-form-environment.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "获取默认 Environment",
    files: [
      "packages/core/src/extension/create-form-environment.test.ts",
      "packages/core/src/extension/built-in.test.ts",
    ],
  },
  {
    spec: "core-plugin-environment",
    scenario: "Environment 不泄漏到后续构建",
    files: ["packages/core/src/extension/environment-isolation.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "解析默认 text Widget",
    files: ["packages/core/src/extension/built-in.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "默认 Widget 不绑定 UI library",
    files: [
      "packages/core/src/extension/built-in.test.ts",
      "packages/core/type-tests/extension-widget.ts",
    ],
  },
  {
    spec: "core-plugin-environment",
    scenario: "依赖先于依赖方安装",
    files: ["packages/core/src/extension/dependency.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "保持无依赖 Plugin 的输入顺序",
    files: ["packages/core/src/extension/dependency.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "报告缺失依赖",
    files: ["packages/core/src/extension/dependency.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "报告依赖环",
    files: ["packages/core/src/extension/cycle.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "接受兼容 Plugin",
    files: ["packages/core/src/extension/protocol-environment.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "拒绝不兼容 Plugin",
    files: [
      "packages/core/src/extension/protocol.test.ts",
      "packages/core/src/extension/protocol-environment.test.ts",
    ],
  },
  {
    spec: "core-plugin-environment",
    scenario: "拒绝重复 Plugin ID",
    files: ["packages/core/src/extension/plugin-id.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "默认拒绝重复 Registry key",
    files: ["packages/core/src/extension/registry-conflict.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "应用显式批准的覆盖",
    files: ["packages/core/src/extension/override.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "拒绝宽泛或不匹配的覆盖许可",
    files: ["packages/core/src/extension/override.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "拒绝构建后的 Registry mutation",
    files: [
      "packages/core/src/extension/registry.test.ts",
      "packages/core/type-tests/extension-environment.ts",
      "packages/core/src/extension/environment-isolation.test.ts",
    ],
  },
  {
    spec: "core-plugin-environment",
    scenario: "重复构建产生隔离实例",
    files: ["packages/core/src/extension/environment-isolation.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "Instrumentation 仅观察公共信息",
    files: ["packages/core/type-tests/extension-plugin.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "消费结构化构建失败",
    files: ["packages/core/src/extension/create-form-environment.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "Diagnostic metadata 保持只读",
    files: [
      "packages/core/src/extension/environment-build-error.test.ts",
      "packages/core/type-tests/environment-build-error.ts",
    ],
  },
];

describe("definition and environment scenario coverage", () => {
  test("maps every delta spec scenario to an existing unit, type, or contract test", () => {
    expect(SCENARIOS).toHaveLength(30);
    for (const entry of SCENARIOS) {
      expect(entry.files.length, entry.scenario).toBeGreaterThan(0);
      for (const relative of entry.files) {
        expect(fs.existsSync(path.join(REPO_ROOT, relative)), `${entry.scenario} -> ${relative}`).toBe(
          true,
        );
      }
    }
  });
});
