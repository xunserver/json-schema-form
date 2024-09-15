import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.js";

const SCENARIOS: readonly { spec: string; scenario: string; files: readonly string[] }[] = [
  {
    spec: "core-plugin-environment",
    scenario: "Plugin注册可调用providers",
    files: [
      "packages/core/src/extension/contribution-providers.test.ts",
      "packages/core/src/extension/define-plugin.test.ts",
    ],
  },
  {
    spec: "core-plugin-environment",
    scenario: "Plugin注册dialect、extension与initializer providers",
    files: ["packages/core/src/extension/contribution-providers.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "类型拒绝async与mutable context",
    files: ["packages/core/type-tests/schema-contributions.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "接受一致的key与name",
    files: ["packages/core/src/extension/contribution-providers.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "拒绝key/name不一致",
    files: ["packages/core/src/extension/contribution-providers.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "拒绝重复的dialect URI或extension keyword",
    files: ["packages/core/src/extension/contribution-providers.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "拒绝非法extension keyword",
    files: ["packages/core/src/extension/contribution-providers.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "通过 adapter 编译 draft-07 Schema",
    files: ["packages/core/src/compiler/schema/dialect-adapter.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "无 adapter 时保持阻断",
    files: ["packages/core/src/compiler/schema/dialect-adapter.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "adapter 失败不产生 partial model",
    files: ["packages/core/src/compiler/schema/dialect-adapter.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "相同输入重复转换结果等价",
    files: ["packages/core/src/compiler/schema/dialect-adapter.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "x-ui 拆分为 FieldUI",
    files: ["packages/core/src/compiler/schema/extensions.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "显式 UI Schema 覆盖扩展片段",
    files: ["packages/core/src/compiler/schema/extensions.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "数组模板位置按 ModelPath 拆分",
    files: ["packages/core/src/compiler/schema/extensions.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "不可映射位置产生 unsupported diagnostic",
    files: ["packages/core/src/compiler/schema/extensions.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "未声明 x-* 仍只警告",
    files: ["packages/core/src/compiler/schema/extensions.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "split 失败阻断编译",
    files: ["packages/core/src/compiler/schema/extensions.test.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "声明active-only named serialization",
    files: ["packages/core/src/compiler/rule/compile.test.ts", "packages/core/type-tests/rules.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "声明named value initializer",
    files: ["packages/core/src/compiler/rule/compile.test.ts", "packages/core/type-tests/rules.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "拒绝未注册的initializer key",
    files: ["packages/core/src/compiler/rule/compile.test.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "类型拒绝内嵌provider",
    files: ["packages/core/type-tests/rules.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "默认 initializer 填充初始值",
    files: ["packages/core/src/runtime/value/value-initializer.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "create option 覆盖默认 initializer",
    files: ["packages/core/src/runtime/value/value-initializer.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "reset 恢复 initializer 结果",
    files: ["packages/core/src/runtime/value/value-initializer.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "initializer 在 identity 与 Rule 稳定之前运行",
    files: ["packages/core/src/runtime/value/value-initializer.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "initializer 失败阻断创建",
    files: ["packages/core/src/runtime/value/value-initializer.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "拒绝未注册或跨 Environment 的 initializer",
    files: ["packages/core/src/runtime/value/value-initializer.test.ts"],
  },
  {
    spec: "package-architecture",
    scenario: "顶层目录与架构一致",
    files: [
      "tests/architecture/check-boundaries.test.ts",
      "tools/architecture-check/policy.ts",
      "tools/architecture-check/check.ts",
    ],
  },
  {
    spec: "package-architecture",
    scenario: "子领域目录存在且承载对应代码",
    files: [
      "tests/architecture/check-boundaries.test.ts",
      "packages/core/src/runtime/array/array-identity.test.ts",
      "packages/core/src/runtime/scope/render-scope.test.ts",
      "packages/core/src/compiler/validation/compile.test.ts",
      "packages/core/src/runtime/validation/engine.test.ts",
    ],
  },
  {
    spec: "package-architecture",
    scenario: "目录迁移不改变公共边界",
    files: [
      "tests/contracts/declarations.test.ts",
      "tests/contracts/export-isolation.test.ts",
      "tests/contracts/positive/extension-entry.ts",
      "tests/contracts/negative/extension-from-root.ts",
      "tests/contracts/negative/runtime-contributions.ts",
      "tests/contracts/negative/deep-import.ts",
    ],
  },
  {
    spec: "package-architecture",
    scenario: "拒绝垃圾桶目录",
    files: ["tests/architecture/check-boundaries.test.ts", "tests/architecture/fault-injection.test.ts"],
  },
  {
    spec: "package-architecture",
    scenario: "验证未修改的合规工作区",
    files: ["tests/architecture/check-boundaries.test.ts"],
  },
  {
    spec: "package-architecture",
    scenario: "报告可操作的边界错误",
    files: ["tests/architecture/fault-injection.test.ts"],
  },
];

describe("align-core-contributions-and-layout scenario coverage", () => {
  test("maps every delta spec scenario to an existing unit, type, contract, or integration test", () => {
    expect(SCENARIOS).toHaveLength(33);
    for (const entry of SCENARIOS) {
      expect(entry.files.length, entry.scenario).toBeGreaterThan(0);
      for (const relative of entry.files) {
        expect(fs.existsSync(path.join(REPO_ROOT, relative)), `${entry.scenario} -> ${relative}`).toBe(true);
      }
    }
  });
});
