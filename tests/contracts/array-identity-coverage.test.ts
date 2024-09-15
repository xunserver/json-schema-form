import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.ts";

const SCENARIOS: readonly { spec: string; scenario: string; files: readonly string[] }[] = [
  {
    spec: "array-identity-and-scopes",
    scenario: "初始化外层和嵌套数组身份",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "move 改变地址但不改变身份",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "同一 Model 的实例不共享 ID",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "append materialize 嵌套模板",
    files: ["packages/core/src/runtime/array-identity.test.ts", "tests/runtime/array-e2e.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "按需访问递归实例",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "object container 与 array 越界边界不同",
    files: ["packages/core/src/runtime/array-identity.test.ts", "packages/core/src/runtime/create-form.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "append 与 insert 原子建立身份",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "move 只重排现有 item",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "clear 清空所有 item",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "非法引用没有部分修改",
    files: ["packages/core/src/runtime/array-identity.test.ts", "packages/core/src/runtime/array-diagnostics.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "固定 tuple 不伪装为 list",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "setItemValue 保留根 item identity",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "replaceItem 建立新逻辑 item",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "更新外层 item 会重建被替换的 nested array",
    files: ["tests/runtime/array-e2e.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "默认 whole-array replacement 不猜测身份",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "等价 setValue 保持 no-op",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "reset 重建初始数组身份",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "按唯一业务 key 保留身份",
    files: ["packages/core/src/runtime/array-identity.test.ts", "tests/runtime/array-e2e.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "无 key 的 item 不被猜测匹配",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "歧义或 resolver 抛错会回滚",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "touched 和 focused 随 ID move",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "move 不产生虚假的 descendant value change",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "remove 清理后续 owner state 和 run token",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "index 与 ID 得到同一 item scope",
    files: ["packages/core/src/runtime/array-identity.test.ts", "packages/core/type-tests/array-instance.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "moved scope 动态解析当前位置",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "nested scope 不产生嵌套 Runtime",
    files: ["packages/core/src/runtime/array-identity.test.ts", "tests/runtime/array-e2e.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "已删除 scope 不会重新绑定 index",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "sibling array mutation 不通知目标 selector",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "snapshot 不能绕过 Array API",
    files: ["packages/core/type-tests/array-instance.ts", "packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "Validation probe 复用稳定 binding",
    files: ["packages/core/src/runtime/array-identity.test.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "Renderer probe 只能读取 identity/order",
    files: ["packages/core/type-tests/array-runtime.ts", "packages/core/type-tests/runtime-internals-runtime.ts"],
  },
  {
    spec: "array-identity-and-scopes",
    scenario: "本 change 不执行后续业务语义",
    files: ["packages/core/type-tests/form-instance.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "导入根入口公共契约",
    files: ["packages/core/type-tests/array-instance.ts", "tests/contracts/positive/create-form.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "导入受支持的子路径",
    files: ["packages/core/type-tests/array-runtime.ts", "tests/contracts/positive/runtime-entry.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "根入口不重导出 Advanced 或 Extension factory",
    files: ["packages/core/type-tests/runtime-from-root.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "拒绝内部 deep import",
    files: ["tests/contracts/negative/runtime-deep-import.ts"],
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
    ],
  },
];

describe("add-array-identity-and-scopes scenario coverage", () => {
  test("maps every delta spec scenario to an existing fixture", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(32);
    for (const entry of SCENARIOS) {
      expect(entry.files.length, entry.scenario).toBeGreaterThan(0);
      for (const relative of entry.files) {
        expect(fs.existsSync(path.join(REPO_ROOT, relative)), `${entry.scenario} -> ${relative}`).toBe(true);
      }
    }
  });
});
