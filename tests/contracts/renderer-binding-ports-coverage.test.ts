import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.ts";

const SCENARIOS: readonly { spec: string; scenario: string; files: readonly string[] }[] = [
  {
    spec: "core-public-contracts",
    scenario: "导入根入口公共契约",
    files: ["tests/contracts/positive/create-form.ts", "packages/core/type-tests/form-instance.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "导入受支持的子路径",
    files: ["tests/contracts/positive/runtime-entry.ts", "packages/core/type-tests/render-scope.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "导入受支持的extension子路径",
    files: ["tests/contracts/positive/extension-entry.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "从 Extension 子路径声明 Widget",
    files: ["tests/contracts/positive/extension-entry.ts", "packages/core/type-tests/define-widget.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "根入口不重导出 Advanced 或 Extension factory",
    files: [
      "tests/contracts/negative/runtime-from-root.ts",
      "packages/core/type-tests/runtime-from-root.ts",
    ],
  },
  {
    spec: "core-public-contracts",
    scenario: "拒绝内部 deep import",
    files: ["tests/contracts/negative/runtime-deep-import.ts", "tests/contracts/export-isolation.test.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "根导出不包含内部符号",
    files: ["tests/contracts/negative/private-symbol.ts", "packages/core/type-tests/runtime-internals-root.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "所有公共入口均不泄漏 Runtime internals",
    files: [
      "packages/core/type-tests/runtime-internals-root.ts",
      "packages/core/type-tests/runtime-internals-runtime.ts",
      "tests/contracts/declarations.test.ts",
    ],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "原子替换完整 values",
    files: ["packages/core/src/runtime/create-form.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "touch 与 focus 使用不同身份",
    files: ["packages/core/src/runtime/commands.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "blur 清除目标 View 的 focused",
    files: ["packages/core/src/runtime/view-interaction.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "对未 focused 的 View blur 是 no-op",
    files: ["packages/core/src/runtime/view-interaction.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "collapsed 与 activeTab 属于具体 View",
    files: ["packages/core/src/runtime/view-interaction.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "reset 恢复初始基础状态",
    files: ["packages/core/src/runtime/view-interaction.test.ts", "packages/core/src/runtime/commands.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "拒绝隐式创建数组项",
    files: ["packages/core/src/runtime/create-form.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "拒绝未知 View 的交互命令",
    files: ["packages/core/src/runtime/view-interaction.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "value 往返后 dirty 恢复",
    files: ["packages/core/src/runtime/runtime-state.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "descendants 聚合 touched",
    files: ["packages/core/src/runtime/runtime-state.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "View source state 不可绕过命令修改",
    files: ["packages/core/src/runtime/view-interaction.test.ts", "packages/core/type-tests/form-instance.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "active 与 visible 不被基础状态冒充",
    files: ["packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "blur 记录所属 Field binding",
    files: ["packages/core/src/runtime/view-interaction.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "非 blur 命令不产生 interaction 记录",
    files: ["packages/core/src/runtime/view-interaction.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "被删除 item 的 blur 记录不泄漏到新 item",
    files: ["packages/core/src/runtime/view-interaction.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "sibling array mutation 不通知目标 selector",
    files: ["packages/core/src/runtime/render-scope.test.ts", "packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "current-binding snapshot 是完整 InstanceBinding",
    files: ["packages/core/src/runtime/render-scope.test.ts", "packages/core/type-tests/render-scope.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "snapshot 不能绕过 Array API",
    files: ["packages/core/src/runtime/render-scope.test.ts", "packages/core/type-tests/render-scope.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "在 item scope 中解析模板 ModelPath",
    files: ["packages/core/src/runtime/render-scope.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "move 后 scope 实体不变而地址更新",
    files: ["packages/core/src/runtime/render-scope.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "删除后 scope 永久 stale",
    files: ["packages/core/src/runtime/render-scope.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "拒绝跨 FormInstance 的 RenderScope",
    files: ["packages/core/src/runtime/render-scope.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "RenderScope 不提供 writer",
    files: ["packages/core/src/runtime/render-scope.test.ts", "packages/core/type-tests/render-scope.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "hidden保持active",
    files: ["packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "Schema inactive不能被visible或Rule active覆盖",
    files: ["packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "多来源组合确定且保守",
    files: ["packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "静态required直接投影",
    files: ["packages/core/src/runtime/required-effective.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "conditional required跟随activation切换",
    files: ["packages/core/src/runtime/required-effective.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "inactive Field不报告required",
    files: ["packages/core/src/runtime/required-effective.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "精确selector只通知受影响状态",
    files: ["packages/core/src/runtime/required-effective.test.ts", "packages/core/src/runtime/activation-serialize.test.ts"],
  },
];

describe("add-renderer-interaction-and-binding-ports scenario coverage", () => {
  test("maps every delta spec scenario to an existing fixture", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(35);
    for (const entry of SCENARIOS) {
      expect(entry.files.length, entry.scenario).toBeGreaterThan(0);
      for (const relative of entry.files) {
        expect(fs.existsSync(path.join(REPO_ROOT, relative)), `${entry.scenario} -> ${relative}`).toBe(true);
      }
    }
  });
});
