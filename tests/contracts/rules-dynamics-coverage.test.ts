import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { REPO_ROOT } from "../lib/fs.js";

const SCENARIOS: readonly { spec: string; scenario: string; files: readonly string[] }[] = [
  {
    spec: "core-public-contracts",
    scenario: "导入根入口公共契约",
    files: ["tests/contracts/positive/root-contracts.ts", "packages/core/type-tests/form-instance.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "导入受支持的子路径",
    files: ["tests/contracts/positive/runtime-entry.ts", "packages/core/type-tests/runtime-selectors.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "导入受支持的extension子路径",
    files: ["tests/contracts/positive/extension-entry.ts", "packages/core/src/extension/define-rule-function.test.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "根入口不重导出Advanced或Extension factory",
    files: ["tests/contracts/negative/runtime-from-root.ts", "tests/contracts/negative/extension-from-root.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "拒绝内部 deep import",
    files: ["tests/contracts/negative/runtime-deep-import.ts", "tests/contracts/negative/compiler-deep-import.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "根导出不包含内部符号",
    files: ["tests/contracts/negative/private-symbol.ts", "packages/core/type-tests/runtime-internals-root.ts"],
  },
  {
    spec: "core-public-contracts",
    scenario: "所有公共入口均不泄漏Runtime internals",
    files: [
      "packages/core/type-tests/runtime-internals-root.ts",
      "packages/core/type-tests/runtime-internals-runtime.ts",
      "packages/core/type-tests/runtime-internals-extension.ts",
    ],
  },
  {
    spec: "form-definition-authoring",
    scenario: "声明可分析的field与call表达式",
    files: ["packages/core/type-tests/rules.ts", "packages/core/src/compiler/rule/expression.test.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "object常量与operator保持无歧义",
    files: ["packages/core/src/compiler/rule/expression.test.ts", "packages/core/type-tests/rules.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "拒绝内嵌function或Runtime对象",
    files: ["packages/core/src/compiler/rule/expression.test.ts", "packages/core/type-tests/rules.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "声明State与Computed Rule",
    files: ["packages/core/type-tests/rules.ts", "packages/core/src/compiler/rule/compile.test.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "声明Validation Rule而不内嵌ValidationError",
    files: ["packages/core/type-tests/rules.ts", "packages/core/src/compiler/rule/compile.test.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "Effect只接受setValue action",
    files: ["packages/core/type-tests/rules.ts", "packages/core/src/compiler/rule/compile.test.ts"],
  },
  {
    spec: "form-definition-authoring",
    scenario: "声明active-only named serialization",
    files: ["packages/core/type-tests/rules.ts", "packages/core/src/compiler/rule/compile.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "声明named Rule Function",
    files: ["packages/core/src/extension/define-rule-function.test.ts", "packages/core/type-tests/rule-function.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "重复authoring不产生全局状态",
    files: ["packages/core/src/extension/define-rule-function.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "Plugin注册可调用providers",
    files: ["packages/core/src/extension/define-rule-function.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "类型拒绝async与mutable context",
    files: ["packages/core/type-tests/rule-function.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "接受一致的key与name",
    files: ["packages/core/src/extension/define-rule-function.test.ts"],
  },
  {
    spec: "core-plugin-environment",
    scenario: "拒绝key/name不一致",
    files: ["packages/core/src/extension/define-rule-function.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "编译Rule与dependency index",
    files: ["packages/core/src/compiler/rule/compile.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "聚合非法target与function引用",
    files: ["packages/core/src/compiler/rule/compile.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "拒绝无法唯一绑定的array dependency",
    files: ["packages/core/src/compiler/rule/compile.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "重复编译保持RuleModel稳定",
    files: ["packages/core/src/compiler/rule/compile.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "按名称调用纯函数",
    files: ["packages/core/src/rule/evaluator.test.ts", "tests/runtime/rules-e2e.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "Function失败不发布中间态",
    files: ["packages/core/src/rule/evaluator.test.ts", "packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "array item Rule绑定同一item",
    files: ["packages/core/src/runtime/rules-runtime.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "move不重建Rule instance",
    files: ["packages/core/src/runtime/rules-runtime.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "append与remove更新scheduler binding",
    files: ["packages/core/src/runtime/rules-runtime.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "初始值在公开前稳定",
    files: ["packages/core/src/runtime/rules-runtime.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "State Rule更新effective selector",
    files: ["packages/core/src/runtime/rules-runtime.test.ts", "packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "State Rule不改business value",
    files: ["packages/core/src/runtime/rules-runtime.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "链式computed按拓扑顺序稳定",
    files: ["packages/core/src/runtime/rules-runtime.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "computed target默认readonly",
    files: ["packages/core/src/runtime/rules-runtime.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "cycle与多writer阻断编译",
    files: ["packages/core/src/compiler/rule/compile.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "Effect写入留在当前transaction",
    files: ["packages/core/src/runtime/rules-runtime.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "no-op Effect不重复循环",
    files: ["packages/core/src/runtime/rules-runtime.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "oscillating Effect完整回滚",
    files: ["packages/core/src/runtime/rules-runtime.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "编译Validation Rule结构",
    files: ["packages/core/src/compiler/rule/compile.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "稳定后交给Validation owner",
    files: ["packages/core/src/runtime/rules-runtime.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "未安装Validation实现时不冒充valid",
    files: ["packages/core/src/runtime/rules-runtime.test.ts", "packages/core/type-tests/form-instance.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "编译discriminated oneOf与anyOf",
    files: ["packages/core/src/compiler/dynamics/compile.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "编译if与dependentSchemas",
    files: ["packages/core/src/compiler/dynamics/compile.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "无法保真的condition显式失败",
    files: ["packages/core/src/compiler/dynamics/compile.test.ts", "packages/core/src/compiler/dynamics/predicate.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "branch切换保留draft state",
    files: ["packages/core/src/runtime/activation-serialize.test.ts", "tests/runtime/rules-e2e.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "inactive仍可寻址和编程修改",
    files: ["packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "oneOf暂时歧义不猜branch",
    files: ["packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "重新active会重新调度",
    files: ["packages/core/src/runtime/activation-serialize.test.ts", "tests/runtime/rules-e2e.test.ts"],
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
    scenario: "精确selector只通知受影响状态",
    files: ["packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "默认active-only而getValues保留全部",
    files: ["packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "显式包含inactive值",
    files: ["packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "active-only数组保持有效顺序",
    files: ["packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "named Serializer消费pruned snapshot",
    files: ["packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "Serializer失败不成为transaction",
    files: ["packages/core/src/runtime/activation-serialize.test.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "拒绝async与I/O能力",
    files: ["packages/core/src/runtime/activation-serialize.test.ts", "packages/core/type-tests/rule-function.ts"],
  },
  {
    spec: "rules-and-schema-dynamics",
    scenario: "Renderer只消费effective snapshot",
    files: ["packages/core/type-tests/form-instance.ts", "packages/core/type-tests/runtime-selectors.ts"],
  },
];

describe("rules and schema dynamics scenario coverage", () => {
  test("maps every delta spec scenario to an existing unit, type, contract, or integration fixture", () => {
    expect(SCENARIOS).toHaveLength(59);
    for (const entry of SCENARIOS) {
      expect(entry.files.length, entry.scenario).toBeGreaterThan(0);
      for (const relative of entry.files) {
        expect(fs.existsSync(path.join(REPO_ROOT, relative)), `${entry.scenario} -> ${relative}`).toBe(true);
      }
    }
  });
});
