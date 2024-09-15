import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.ts";

const SCENARIOS: readonly { spec: string; scenario: string; files: readonly string[] }[] = [
  {
    spec: "core-public-contracts",
    scenario: "使用默认 Environment 编译",
    files: [
      "packages/core/src/compiler/compile-form.test.ts",
      "packages/core/type-tests/compile-form.ts",
      "tests/contracts/positive/compile-form.ts",
    ],
  },
  {
    spec: "core-public-contracts",
    scenario: "使用显式 Environment 编译",
    files: [
      "packages/core/src/compiler/compile-form.test.ts",
      "packages/core/type-tests/compile-form.ts",
      "tests/contracts/positive/compile-form.ts",
    ],
  },
  {
    spec: "core-public-contracts",
    scenario: "重复编译具有纯函数语义",
    files: ["packages/core/src/compiler/data-model.test.ts", "tests/compile/e2e.test.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "拒绝修改已编译 Model",
    files: [
      "packages/core/src/compiler/data-model.test.ts",
      "packages/core/type-tests/model.ts",
      "tests/contracts/negative/readonly-mutation.ts",
    ],
  },
  {
    spec: "core-public-contracts",
    scenario: "Model 不包含 Runtime state",
    files: ["packages/core/src/compiler/data-model.test.ts", "packages/core/type-tests/model.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "成功返回非阻断 Diagnostic",
    files: ["packages/core/src/compiler/shape/analyze.test.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "聚合阻断问题而不发布 partial model",
    files: ["packages/core/src/compiler/compile-form.test.ts", "packages/core/src/compiler/ui-model.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "编译未声明 dialect 的常用 Schema",
    files: ["packages/core/src/compiler/schema/frontend.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "拒绝 malformed keyword",
    files: ["packages/core/src/compiler/schema/frontend.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "拒绝未支持 dialect",
    files: ["packages/core/src/compiler/schema/frontend.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "多处引用同一 `$defs` 节点",
    files: ["packages/core/src/compiler/schema/frontend.test.ts", "packages/core/src/compiler/data-model.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "保留 Draft 2020-12 的 ref sibling",
    files: ["packages/core/src/compiler/schema/frontend.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "识别递归引用和未解析引用",
    files: ["packages/core/src/compiler/schema/frontend.test.ts", "packages/core/src/compiler/data-model.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "保留 boolean 与 applicator 语义",
    files: ["packages/core/src/compiler/schema/frontend.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "未声明的 x 扩展不成为内部核心协议",
    files: ["packages/core/src/compiler/schema/frontend.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "从 structural keyword 推导 Object",
    files: ["packages/core/src/compiler/shape/analyze.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "区分 list、tuple 与 nullable scalar",
    files: ["packages/core/src/compiler/shape/analyze.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "enum 和 format 仅影响后续消费",
    files: ["packages/core/src/compiler/shape/analyze.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "保守处理无法确定的结构组合",
    files: ["packages/core/src/compiler/shape/analyze.test.ts"],
  },
  {
    spec: "schema-frontend-and-shape-analysis",
    scenario: "保留有限 conditional 的候选结构",
    files: ["packages/core/src/compiler/shape/analyze.test.ts"],
  },
  {
    spec: "static-data-model",
    scenario: "共享 Schema 产生不同位置节点",
    files: ["packages/core/src/compiler/data-model.test.ts", "tests/compile/e2e.test.ts"],
  },
  {
    spec: "static-data-model",
    scenario: "Path 与 ID 保持不同语义",
    files: ["packages/core/src/compiler/data-model.test.ts", "packages/core/type-tests/identity.ts"],
  },
  {
    spec: "static-data-model",
    scenario: "编译 required property",
    files: ["packages/core/src/compiler/data-model.test.ts"],
  },
  {
    spec: "static-data-model",
    scenario: "合并组合来源的同一 property",
    files: ["packages/core/src/compiler/shape/analyze.test.ts"],
  },
  {
    spec: "static-data-model",
    scenario: "编译 list item template",
    files: ["packages/core/src/compiler/data-model.test.ts"],
  },
  {
    spec: "static-data-model",
    scenario: "编译 tuple slots",
    files: ["packages/core/src/compiler/shape/analyze.test.ts"],
  },
  {
    spec: "static-data-model",
    scenario: "编译递归目录 Schema",
    files: ["packages/core/src/compiler/data-model.test.ts", "tests/compile/e2e.test.ts"],
  },
  {
    spec: "static-data-model",
    scenario: "不把普通共享引用误判为递归",
    files: ["packages/core/src/compiler/data-model.test.ts"],
  },
  {
    spec: "static-data-model",
    scenario: "条件分支引入不同字段",
    files: ["packages/core/src/compiler/shape/analyze.test.ts", "tests/compile/e2e.test.ts"],
  },
  {
    spec: "static-data-model",
    scenario: "分支同路径具有不同 shape",
    files: ["packages/core/src/compiler/shape/analyze.test.ts"],
  },
  {
    spec: "static-data-model",
    scenario: "从同一模型创建实例的前置隔离",
    files: ["packages/core/src/compiler/data-model.test.ts", "packages/core/type-tests/model.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "默认投影 scalar 与 container",
    files: ["packages/core/src/compiler/ui-model.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "field false 与 visible false 不等价",
    files: ["packages/core/src/compiler/ui-model.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "Object 使用 atomic Widget",
    files: ["packages/core/src/compiler/ui-model.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "显式 Widget 胜过 matcher",
    files: ["packages/core/src/compiler/ui-model.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "matcher 类别与优先级确定选择",
    files: ["packages/core/src/compiler/ui-model.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "报告缺失或不兼容 Widget",
    files: ["packages/core/src/compiler/ui-model.test.ts", "tests/compile/e2e.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "拒绝不存在的 Field Path",
    files: ["packages/core/src/compiler/ui-model.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "按 Adapter ID 保留 native options",
    files: ["packages/core/src/compiler/ui-model.test.ts", "tests/compile/e2e.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "拒绝 native 覆盖核心状态",
    files: ["packages/core/src/compiler/ui-model.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "生成嵌套默认 ViewTree",
    files: ["packages/core/src/compiler/ui-model.test.ts", "tests/compile/e2e.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "atomic container 不展开默认 children",
    files: ["packages/core/src/compiler/ui-model.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "未引用字段默认不渲染",
    files: ["packages/core/src/compiler/ui-model.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "remaining-fields 显式补齐",
    files: ["packages/core/src/compiler/ui-model.test.ts", "tests/compile/e2e.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "同一 Field 多次呈现",
    files: ["packages/core/src/compiler/ui-model.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "区分数据 container 与展示 group",
    files: ["packages/core/src/compiler/ui-model.test.ts", "packages/core/type-tests/data-ui-boundaries.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "ViewTree 不泄漏 Render-time state",
    files: ["packages/core/src/compiler/ui-model.test.ts", "packages/core/type-tests/data-ui-boundaries.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "保留自定义 Widget identity 与 literal",
    files: [
      "packages/core/src/extension/define-widget.test.ts",
      "packages/core/type-tests/define-widget.ts",
      "tests/contracts/positive/extension-entry.ts",
    ],
  },
  {
    spec: "core-plugin-environment",
    scenario: "helper 调用不触发 Registry 冲突",
    files: ["packages/core/src/extension/define-widget.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "默认 Widget 提供完整 semantic action capability",
    files: ["packages/core/src/extension/built-in.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "自定义 Widget 只声明逻辑能力",
    files: [
      "packages/core/src/compiler/ui-model.test.ts",
      "packages/core/type-tests/define-widget.ts",
      "tests/contracts/adapter-interaction-preflight.test.ts",
    ],
  },
  {
    spec: "core-plugin-environment",
    scenario: "拒绝非法 interaction descriptor",
    files: [
      "packages/core/src/extension/create-form-environment.test.ts",
      "packages/core/src/compiler/ui/widget-resolver.test.ts",
    ],
  },
  {
    spec: "core-plugin-environment",
    scenario: "Adapter capability 不足时不得静默降级",
    files: ["tests/contracts/adapter-interaction-preflight.test.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "从 Extension 子路径声明 Widget",
    files: [
      "tests/contracts/positive/extension-entry.ts",
      "tests/contracts/declarations.test.ts",
      "tests/contracts/export-resolution.test.ts",
    ],
  },
  {
    spec: "core-public-contracts",
    scenario: "根入口不重导出 Advanced 或 Extension factory",
    files: [
      "tests/contracts/negative/extension-from-root.ts",
      "tests/contracts/export-isolation.test.ts",
      "tests/contracts/export-resolution.test.ts",
    ],
  },
  {
    spec: "static-ui-model",
    scenario: "投影静态 required 与 optional 来源",
    files: [
      "packages/core/src/compiler/ui-model.test.ts",
      "packages/core/type-tests/data-ui-boundaries.ts",
    ],
  },
  {
    spec: "static-ui-model",
    scenario: "conditional required 只记录 Dynamics 来源",
    files: [
      "packages/core/src/compiler/ui-model.test.ts",
      "tests/contracts/requirement-handoff.test.ts",
    ],
  },
  {
    spec: "static-ui-model",
    scenario: "非 property Field 不伪造 required",
    files: ["packages/core/src/compiler/ui-model.test.ts"],
  },
  {
    spec: "static-ui-model",
    scenario: "UI 与 Validation 不能覆盖 required 真相",
    files: [
      "packages/core/src/compiler/ui-model.test.ts",
      "packages/core/type-tests/definition.ts",
    ],
  },
];

describe("compile-static-form-model scenario coverage", () => {
  test("maps every delta spec scenario to an existing unit, type, contract, or integration test", () => {
    expect(SCENARIOS).toHaveLength(59);
    for (const entry of SCENARIOS) {
      expect(entry.files.length, entry.scenario).toBeGreaterThan(0);
      for (const relative of entry.files) {
        expect(fs.existsSync(path.join(REPO_ROOT, relative)), `${entry.scenario} -> ${relative}`).toBe(true);
      }
    }
  });
});
