import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.ts";

const SCENARIOS: readonly { spec: string; scenario: string; files: readonly string[] }[] = [
  {
    spec: "core-public-contracts",
    scenario: "导入根入口公共契约",
    files: [
      "packages/core/type-tests/form-instance.ts",
      "tests/contracts/positive/create-form.ts",
      "tests/contracts/declarations.test.ts",
    ],
  },
  {
    spec: "core-public-contracts",
    scenario: "导入受支持的子路径",
    files: ["packages/core/type-tests/runtime-selectors.ts", "tests/contracts/positive/runtime-entry.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "根入口不重导出 Advanced 或 Extension factory",
    files: [
      "packages/core/type-tests/runtime-from-root.ts",
      "tests/contracts/negative/extension-from-root.ts",
      "tests/contracts/negative/runtime-from-root.ts",
    ],
  },
  {
    spec: "core-public-contracts",
    scenario: "拒绝内部 deep import",
    files: [
      "tests/contracts/negative/compiler-deep-import.ts",
      "tests/contracts/negative/runtime-deep-import.ts",
      "tests/contracts/export-isolation.test.ts",
    ],
  },
  {
    spec: "core-public-contracts",
    scenario: "根导出不包含内部符号",
    files: ["packages/core/type-tests/runtime-internals-root.ts", "tests/contracts/declarations.test.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "所有公共入口均不泄漏 Runtime internals",
    files: [
      "packages/core/type-tests/runtime-internals-root.ts",
      "packages/core/type-tests/runtime-internals-runtime.ts",
      "packages/core/type-tests/runtime-internals-extension.ts",
      "tests/contracts/declarations.test.ts",
    ],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "使用默认 Environment 创建表单",
    files: ["packages/core/src/runtime/create-form.test.ts", "tests/runtime/e2e.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "拒绝不同 Environment 的 Model",
    files: ["packages/core/src/runtime/runtime-state.test.ts", "packages/core/src/runtime/create-form.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "Engine 固定同一生命周期依赖",
    files: ["packages/core/src/runtime/create-form.test.ts", "tests/runtime/e2e.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "同一 Model 创建两个隔离实例",
    files: ["packages/core/src/runtime/create-form.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "Runtime 不修改编译模板",
    files: ["packages/core/src/runtime/create-form.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "Field 与 Form 读取同一嵌套值",
    files: ["packages/core/src/runtime/create-form.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "公开 snapshot 不可用于绕过命令",
    files: ["packages/core/src/runtime/runtime-state.test.ts", "packages/core/type-tests/form-instance.ts"],
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
    scenario: "reset 恢复初始基础状态",
    files: ["packages/core/src/runtime/commands.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "拒绝隐式创建数组项",
    files: ["packages/core/src/runtime/create-form.test.ts", "packages/core/src/runtime/instance-path.test.ts"],
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
    scenario: "active 与 visible 不被基础状态冒充",
    files: ["packages/core/src/runtime/runtime-state.test.ts", "packages/core/type-tests/form-instance.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "setValues 不发布中间字段组合",
    files: ["packages/core/src/runtime/create-form.test.ts", "packages/core/src/runtime/phases.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "失败 transaction 完全回滚外部观察",
    files: ["packages/core/src/runtime/commands.test.ts", "packages/core/src/runtime/phases.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "一次 transaction 只增加一个版本",
    files: ["packages/core/src/runtime/phases.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "重复设置相同值",
    files: ["packages/core/src/runtime/commands.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "重复交互状态命令为 no-op",
    files: ["packages/core/src/runtime/commands.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "Phase 观察顺序固定",
    files: ["packages/core/src/runtime/phases.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "Phase command 留在当前 transaction",
    files: ["packages/core/src/runtime/phases.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "不收敛不发布",
    files: ["packages/core/src/runtime/phases.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "单字段更新只通知相关 selector",
    files: ["packages/core/src/runtime/selectors.test.ts", "packages/core/src/runtime/perf.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "依赖变化但选择结果不变",
    files: ["packages/core/src/runtime/selectors.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "取消订阅后不再通知",
    files: ["packages/core/src/runtime/selectors.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "Subscriber 抛错不回滚",
    files: ["packages/core/src/runtime/selectors.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "非法 Path 不产生 partial mutation",
    files: ["packages/core/src/runtime/create-form.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "Diagnostic observer 无权修改 Runtime",
    files: ["packages/core/src/runtime/selectors.test.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "后续 facade 尚未被基础 Runtime 虚构",
    files: ["packages/core/type-tests/form-instance.ts"],
  },
  {
    spec: "transactional-form-runtime",
    scenario: "Extension 不可绕过 transaction",
    files: ["packages/core/src/runtime/phases.test.ts", "packages/core/type-tests/runtime-selectors.ts"],
  },
];

describe("add-transactional-form-runtime scenario coverage", () => {
  test("maps every delta spec scenario to an existing unit, type, contract, or integration test", () => {
    expect(SCENARIOS).toHaveLength(36);
    for (const entry of SCENARIOS) {
      expect(entry.files.length, entry.scenario).toBeGreaterThan(0);
      for (const relative of entry.files) {
        expect(fs.existsSync(path.join(REPO_ROOT, relative)), `${entry.scenario} -> ${relative}`).toBe(true);
      }
    }
  });
});
