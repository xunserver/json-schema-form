import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { loadCoverageMatrix } from "../../tools/architecture-check/v1/matrix.js";
import { REPO_ROOT } from "../lib/fs.js";

const SCENARIO_TESTS: Readonly<Record<string, readonly string[]>> = {
  "完整矩阵解析全部架构目录": ["V1-EXTRACTOR-EXACT-SET", "V1-MATRIX-PRODUCT-OWNER"],
  "悬空 owner 或 test 映射阻断验收": ["V1-OWNER-DANGLING", "V1-TEST-RESOLVER-MISSING-FILE"],
  "unresolved prerequisite 提前失败": ["V1-MATRIX-PREFLIGHT", "V1-MATRIX-UNRESOLVED-PRE"],
  "owner 修复后使用公开入口验收": ["V1-PRE-WIDGET-HELPER", "V1-PUBLIC-API-EXPLICIT"],
  "两个 framework 产生等价业务结果": ["V1-CROSS-STACK-COMPARE", "V1-CROSS-STACK-VUE", "V1-CROSS-STACK-REACT"],
  "跨 framework 实现耦合被拒绝": ["V1-DEP-FAULT", "V1-CROSS-STACK-DIFF"],
  "五类宿主环境加载 Core": ["V1-PORTABILITY-NODE", "V1-PORTABILITY-BROWSER", "V1-PORTABILITY-WORKER", "V1-SSR-VUE"],
  "Model 可复用而实例状态隔离": ["V1-MODEL-REUSE-FINGERPRINT", "V1-MODEL-REUSE-ISOLATION"],
  "move 保留实体状态而更新地址": ["V1-ARRAY-MOVE-STATE"],
  "单字段 transaction 只发布稳定受影响结果": ["V1-STABLE-TX", "V1-PRECISION-FIELD", "V1-RENDER-PRECISION"],
  "native 与 custom 交互都只能调用语义端口": ["V1-ADAPTER-PORT", "V1-ADAPTER-CHROME"],
  "protected prop 与非法 codec 无部分写入": ["V1-ADAPTER-PORT"],
  "五类 source 均可定位且无静默 fallback": ["V1-DIAGNOSTIC-SOURCES"],
  "诊断 redaction 与确定顺序可重复": ["V1-DIAGNOSTIC-STABLE"],
  "三条生命周期路径与全部 FormInstance facade 可组合": ["V1-PUBLIC-API-DEFAULT", "V1-PUBLIC-API-EXPLICIT", "V1-PUBLIC-API-ENGINE"],
  "延后能力保持缺席": ["V1-DEFERRED-ABSENCE"],
  "干净 checkout 生成完整通过证据": ["V1-EVIDENCE-ATOMIC", "V1-CI-FROZEN-LOCKFILE"],
  "中途失败不留下通过证据": ["V1-EVIDENCE-FAILURE"],
  "完整工作区从公开入口通过": ["V1-WORKSPACE-LAYOUT", "V1-EXAMPLES"],
  "缺失 example 或非法 export 阻断发布": ["V1-WORKSPACE-MISSING", "V1-EXPORT-DEEP-DENY"],
  "测试宿主依赖不污染发布包": ["V1-PORTABILITY-DEPS"],
  "MUI X 或跨框架依赖被拒绝": ["V1-DEP-FAULT"],
};

describe("v1 delta spec coverage map", () => {
  test("V1-SCENARIO-MAP maps each acceptance scenario to a V1 test", () => {
    const loaded = loadCoverageMatrix(path.join(REPO_ROOT, "tests/architecture/v1-coverage.json"));
    const tests = new Set(loaded.matrix!.tests.map((item) => item.id));
    const missing: string[] = [];
    for (const [scenario, ids] of Object.entries(SCENARIO_TESTS)) {
      for (const id of ids) {
        if (!tests.has(id)) {
          missing.push(`${scenario} -> ${id}`);
        }
      }
    }
    const specFiles = [
      path.join(REPO_ROOT, "openspec/changes/complete-v1-architecture-acceptance/specs/v1-architecture-acceptance/spec.md"),
      path.join(REPO_ROOT, "openspec/changes/complete-v1-architecture-acceptance/specs/package-architecture/spec.md"),
    ];
    const specScenarios: string[] = [];
    for (const file of specFiles) {
      for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const match = line.match(/^#### Scenario:\s*(.+)\s*$/);
        if (match) {
          specScenarios.push(match[1]!.trim());
        }
      }
    }
    expect(missing).toEqual([]);
    expect(specScenarios.sort()).toEqual(Object.keys(SCENARIO_TESTS).sort());
    expect(Object.keys(SCENARIO_TESTS)).toHaveLength(22);
  });
});
