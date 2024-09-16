import fs from "node:fs";
import path from "node:path";
import { extractArchitecture } from "./extractor.ts";
import { writeCoverageIndex } from "./docs.ts";
import type { CatalogEntry, CommandRecord, CoverageMatrix, OwnerRef, PrerequisiteRecord, TestRecord } from "./types.ts";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const o = (changeId: string, capability: string, requirement: string, scenario: string): OwnerRef => ({
  changeId,
  capability,
  requirement,
  scenario,
});

const e = (
  id: string,
  section: number,
  ordinal: number,
  normalizedText: string,
  status: CatalogEntry["status"],
  owners: OwnerRef[],
  evidenceIds: string[],
): CatalogEntry => ({ id, section, ordinal, normalizedText, status, owners, evidenceIds });

const t = (id: string, kind: TestRecord["kind"], file: string, title: string, commandId = "test"): TestRecord => ({
  id,
  kind,
  file,
  title,
  commandId,
});

const TESTS: TestRecord[] = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "coverage-tests.json"), "utf8"),
) as TestRecord[];

const COMMANDS: CommandRecord[] = [
  { id: "test", kind: "root-script", name: "test" },
  { id: "check:boundaries", kind: "root-script", name: "check:boundaries" },
  { id: "check:v1-matrix", kind: "root-script", name: "check:v1-matrix" },
  { id: "verify:v1", kind: "root-script", name: "verify:v1" },
  { id: "test:v1:host", kind: "root-script", name: "test:v1:host" },
  { id: "test:v1:docs", kind: "root-script", name: "test:v1:docs" },
  { id: "matrix-validate", kind: "builtin", name: "matrix-validate" },
];

void t;

const extracted = extractArchitecture(fs.readFileSync(path.join(ROOT, "docs/architecture.md"), "utf8")).extracted;
if (!extracted) {
  throw new Error("architecture extract failed");
}

function mapped(
  items: typeof extracted.invariants,
  owners: Record<string, OwnerRef[]>,
  evidence: Record<string, string[]>,
  status: CatalogEntry["status"] = "covered",
): CatalogEntry[] {
  return items.map((item) =>
    e(item.id, item.section, item.ordinal, item.normalizedText, status, owners[item.id] ?? [], evidence[item.id] ?? []),
  );
}

const owners = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "coverage-owners.json"), "utf8")) as {
  invariants: Record<string, OwnerRef[]>;
  slices: Record<string, OwnerRef[]>;
  acceptance: Record<string, OwnerRef[]>;
  evidence: Record<string, string[]>;
  sliceEvidence: Record<string, string[]>;
  acEvidence: Record<string, string[]>;
};

const prerequisites: PrerequisiteRecord[] = [
  {
    id: "PRE-WIDGET-HELPER",
    status: "resolved",
    owner: o("compile-static-form-model", "core-plugin-environment", "defineWidget 是无副作用的 Widget authoring helper", "保留自定义 Widget identity 与 literal"),
    publicEntry: "@form/core/extension",
    evidenceIds: ["V1-PRE-WIDGET-HELPER"],
  },
  {
    id: "PRE-RENDER-BINDING",
    status: "resolved",
    owner: o("add-renderer-interaction-and-binding-ports", "array-identity-and-scopes", "RenderScope 是公开只读的实例定位契约", "RenderScope 不提供 writer"),
    publicEntry: "@form/core/runtime",
    evidenceIds: ["V1-PRE-RENDER-BINDING"],
  },
  {
    id: "PRE-BLUR-PORT",
    status: "resolved",
    owner: o("add-renderer-interaction-and-binding-ports", "transactional-form-runtime", "基础 value 与交互命令具有明确语义", "blur 清除目标 View 的 focused"),
    publicEntry: "@form/core",
    evidenceIds: ["V1-PRE-BLUR-PORT"],
  },
  {
    id: "PRE-WIDGET-INTERACTION",
    status: "resolved",
    owner: o("compile-static-form-model", "core-plugin-environment", "WidgetDefinition 声明框架无关的 semantic interaction contract", "默认 Widget 提供完整 semantic action capability"),
    publicEntry: "@form/core/extension",
    evidenceIds: ["V1-PRE-WIDGET-INTERACTION"],
  },
  {
    id: "PRE-REQUIRED-PRESENTATION",
    status: "resolved",
    owner: o("add-renderer-interaction-and-binding-ports", "rules-and-schema-dynamics", "effective状态具有固定组合优先级且active不等于visible", "静态required直接投影"),
    publicEntry: "@form/core",
    evidenceIds: ["V1-PRE-REQUIRED-PRESENTATION"],
  },
  {
    id: "PRE-VIEW-STATE",
    status: "resolved",
    owner: o("add-renderer-interaction-and-binding-ports", "transactional-form-runtime", "基础 value 与交互命令具有明确语义", "collapsed 与 activeTab 属于具体 View"),
    publicEntry: "@form/core",
    evidenceIds: ["V1-PRE-VIEW-STATE"],
  },
  {
    id: "PRE-CORE-LAYOUT",
    status: "resolved",
    owner: o("align-core-contributions-and-layout", "package-architecture", "Core 内部目录按架构生命周期领域组织", "顶层目录与架构一致"),
    publicEntry: "check:boundaries",
    evidenceIds: ["V1-PRE-CORE-LAYOUT"],
  },
  {
    id: "PRE-CONTRIBUTION-PORTS",
    status: "resolved",
    owner: o("align-core-contributions-and-layout", "core-plugin-environment", "Rule Function 与Serializer provider是纯同步只读边界", "Plugin注册dialect、extension与initializer providers"),
    publicEntry: "@form/core/extension",
    evidenceIds: ["V1-PRE-CONTRIBUTION-PORTS"],
  },
];

const packages = [
  "@form/core",
  "@form/validator-ajv",
  "@form/vue",
  "@form/react",
  "@form/element-plus",
].map((name, index) =>
  e(`PKG-0${index + 1}`, 17, index + 1, name, "covered", [o("bootstrap-monorepo-and-contracts", "package-architecture", "首期工作区 package", "发现全部首期 package")], ["V1-WORKSPACE-LAYOUT"]),
);

const directories: CatalogEntry[] = [
  e("DIR-TESTS", 18, 1, "tests/", "covered", [o("bootstrap-monorepo-and-contracts", "package-architecture", "仓库验证包含边界检查", "验证未修改的合规工作区")], ["V1-WORKSPACE-LAYOUT"]),
  e("DIR-DOCS", 18, 2, "docs/", "covered", [o("bootstrap-monorepo-and-contracts", "package-architecture", "仓库验证包含边界检查", "验证未修改的合规工作区")], ["V1-DOCS-INDEX"]),
  e("DIR-EX-PLAYGROUND", 18, 3, "examples/playground/", "covered", [o("bootstrap-monorepo-and-contracts", "package-architecture", "仓库验证包含边界检查", "验证未修改的合规工作区")], ["V1-EXAMPLES"]),
  e("DIR-EX-SHARED", 18, 4, "examples/shared/", "covered", [o("bootstrap-monorepo-and-contracts", "package-architecture", "仓库验证包含边界检查", "验证未修改的合规工作区")], ["V1-EXAMPLES"]),
  e("DIR-CORE-LAYOUT", 18, 5, "packages/core/src architecture domains", "covered", [o("align-core-contributions-and-layout", "package-architecture", "Core 内部目录按架构生命周期领域组织", "顶层目录与架构一致")], ["V1-PRE-CORE-LAYOUT"]),
  e("DIR-VALIDATOR", 18, 6, "packages/validator-ajv/src", "covered", [o("add-validation-pipeline", "package-architecture", "AJV具体依赖与实现只属于validator package", "validator-ajv合法依赖AJV与Core")], ["V1-WORKSPACE-LAYOUT"]),
  e("DIR-VUE", 18, 7, "packages/vue/src renderer/context/composables/adapter", "covered", [o("add-vue-element-plus-rendering", "package-architecture", "Vue 与 Element Plus 只暴露受支持 Renderer 入口", "应用从根入口组合 Renderer")], ["V1-WORKSPACE-LAYOUT"]),
  e("DIR-REACT", 18, 8, "packages/react/src renderer/context/hooks/adapter", "covered", [o("add-react-mui-rendering", "package-architecture", "React 与 UI adapter 渲染包只公开受支持入口", "消费者只使用根入口")], ["V1-WORKSPACE-LAYOUT"]),
  e("DIR-ELEMENT-PLUS", 18, 9, "packages/adapter/element-plus/src widgets/layouts/field-chrome/form", "covered", [o("add-vue-element-plus-rendering", "element-plus-ui-adapter", "Element Plus Adapter 完整提供四类角色", "Form wrapper 不接管 Core 状态")], ["V1-WORKSPACE-LAYOUT"]),
  e("DIR-ANTD", 18, 10, "packages/adapter/antd/src widgets/layouts/field-chrome/form", "covered", [o("add-react-mui-rendering", "antd-ui-adapter", "官方 Ant Design adapter 完整提供四类角色", "Form wrapper 不接管 Core 状态")], ["V1-WORKSPACE-LAYOUT"]),
  e("DIR-SHADCN", 18, 11, "packages/adapter/shadcn/src widgets/layouts/field-chrome/form", "covered", [o("add-react-shadcn-adapter", "shadcn-ui-adapter", "官方 shadcn adapter 通过注入组件提供四类角色", "Form wrapper 不接管 Core 状态")], ["V1-WORKSPACE-LAYOUT"]),
];

const exportsCatalog: CatalogEntry[] = [
  e("EXP-CORE-ROOT", 16, 1, "@form/core", "covered", [o("compile-static-form-model", "core-public-contracts", "受支持的 export 隔离内部模块", "导入根入口公共契约")], ["V1-EXPORT-SURFACE", "V1-PUBLIC-API-DEFAULT"]),
  e("EXP-CORE-RUNTIME", 16, 2, "@form/core/runtime", "covered", [o("add-renderer-interaction-and-binding-ports", "core-public-contracts", "受支持的 export 隔离内部模块", "导入受支持的子路径")], ["V1-PRE-RENDER-BINDING", "V1-EXPORT-SURFACE"]),
  e("EXP-CORE-EXTENSION", 16, 3, "@form/core/extension", "covered", [o("compile-static-form-model", "core-public-contracts", "受支持的 export 隔离内部模块", "导入受支持的extension子路径")], ["V1-PRE-WIDGET-HELPER", "V1-EXPORT-SURFACE"]),
  e("EXP-VALIDATOR-AJV", 17, 4, "@form/validator-ajv", "covered", [o("add-validation-pipeline", "package-architecture", "AJV具体依赖与实现只属于validator package", "validator-ajv合法依赖AJV与Core")], ["V1-EXPORT-SURFACE"]),
  e("EXP-VUE", 17, 5, "@form/vue", "covered", [o("add-vue-element-plus-rendering", "package-architecture", "Vue 与 Element Plus 只暴露受支持 Renderer 入口", "应用从根入口组合 Renderer")], ["V1-EXPORT-SURFACE"]),
  e("EXP-REACT", 17, 6, "@form/react", "covered", [o("add-react-mui-rendering", "package-architecture", "React 与 UI adapter 渲染包只公开受支持入口", "消费者只使用根入口")], ["V1-EXPORT-SURFACE"]),
  e("EXP-ELEMENT-PLUS", 17, 7, "@form/element-plus", "covered", [o("add-vue-element-plus-rendering", "package-architecture", "Vue 与 Element Plus 只暴露受支持 Renderer 入口", "应用从根入口组合 Renderer")], ["V1-EXPORT-SURFACE"]),
  e("EXP-ANTD", 17, 8, "@form/antd", "covered", [o("add-react-mui-rendering", "package-architecture", "React 与 UI adapter 渲染包只公开受支持入口", "消费者只使用根入口")], ["V1-EXPORT-SURFACE"]),
  e("EXP-SHADCN", 17, 10, "@form/shadcn", "covered", [o("add-react-shadcn-adapter", "package-architecture", "React 与 UI adapter 渲染包只公开受支持入口", "消费者只使用根入口")], ["V1-EXPORT-SURFACE"]),
  e("EXP-DEEP-IMPORT-DENY", 16, 9, "undeclared deep import deny", "covered", [o("compile-static-form-model", "core-public-contracts", "受支持的 export 隔离内部模块", "拒绝内部 deep import")], ["V1-EXPORT-DEEP-DENY"]),
];

const diagnosticSources = ["schema", "compiler", "plugin", "adapter", "runtime"].map((name, index) =>
  e(`DIAG-0${index + 1}`, 19, index + 1, name, "covered", [o("bootstrap-monorepo-and-contracts", "core-public-contracts", "Diagnostic 使用共享结构化契约", "消费最小 Diagnostic")], ["V1-DIAGNOSTIC-SOURCES", "V1-DIAGNOSTIC-STABLE"]),
);

const positiveContracts: CatalogEntry[] = [
  e("POS-VIEW-COLLAPSED-ACTIVETAB", 8, 1, "collapsed/activeTab View source state", "covered", [o("add-renderer-interaction-and-binding-ports", "transactional-form-runtime", "基础 value 与交互命令具有明确语义", "collapsed 与 activeTab 属于具体 View")], ["V1-PRE-VIEW-STATE"]),
  e("POS-VALUE-INITIALIZER", 15, 2, "valueInitializers", "covered", [o("align-core-contributions-and-layout", "transactional-form-runtime", "named Value Initializer 在实例化前产出 Runtime-owned initial values", "默认 initializer 填充初始值")], ["V1-PRE-CONTRIBUTION-PORTS"]),
  e("POS-DIALECT-ADAPTER", 7, 3, "SchemaDialectAdapter", "covered", [o("align-core-contributions-and-layout", "schema-frontend-and-shape-analysis", "非 canonical dialect 通过冻结 Registry 的 Dialect Adapter 转换", "通过 adapter 编译 draft-07 Schema")], ["V1-PRE-CONTRIBUTION-PORTS"]),
  e("POS-X-KEYWORD-SPLIT", 7, 4, "declared x-* split", "covered", [o("align-core-contributions-and-layout", "schema-frontend-and-shape-analysis", "已声明的 x-* keyword 在编译前拆分为标准输入", "x-ui 拆分为 FieldUI")], ["V1-PRE-CONTRIBUTION-PORTS"]),
];

const deferredEvidence = ["V1-DEFERRED-ABSENCE"];
const matrix: CoverageMatrix = {
  schemaVersion: 1,
  architectureDigest: extracted.digest,
  catalogs: {
    invariants: mapped(extracted.invariants, owners.invariants, owners.evidence),
    slices: mapped(extracted.slices, owners.slices, owners.sliceEvidence),
    acceptanceCriteria: mapped(extracted.acceptanceCriteria, owners.acceptance, owners.acEvidence),
    packages,
    directories,
    exports: exportsCatalog,
    diagnosticSources,
    deferred: mapped(extracted.deferred, {}, { "DEF-01": deferredEvidence, "DEF-02": deferredEvidence, "DEF-03": deferredEvidence, "DEF-04": deferredEvidence, "DEF-05": deferredEvidence, "DEF-06": deferredEvidence, "DEF-07": deferredEvidence, "DEF-08": deferredEvidence }, "deferred"),
    positiveContracts,
  },
  prerequisites,
  tests: TESTS,
  commands: COMMANDS,
};

const output = path.join(ROOT, "tests/architecture/v1-coverage.json");
fs.writeFileSync(output, `${JSON.stringify(matrix, null, 2)}\n`);
writeCoverageIndex(ROOT, matrix);
process.stdout.write(`wrote ${output}\n`);
