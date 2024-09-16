# v1 architecture coverage index

本文件由 `tests/architecture/v1-coverage.json` 生成，仅作索引，不改写 `docs/architecture.md` 规范正文。

- schemaVersion: 1
- architectureDigest: `ecff28cdd210e685935e4f0c29363ddfa26a70eb4d70c39859f70d6e74fa3e6e`

## Invariants

| ID | Status | Owner | Evidence |
|---|---|---|---|
| INV-01 | covered | add-definition-and-environment / 声明完整 Definition | V1-FIXTURE-PUBLIC-ONLY, V1-PUBLIC-API-DEFAULT |
| INV-02 | covered | compile-static-form-model / 使用默认 Environment 编译 | V1-PUBLIC-API-DEFAULT, V1-PUBLIC-API-EXPLICIT, V1-PUBLIC-API-ENGINE |
| INV-03 | covered | compile-static-form-model / 拒绝修改已编译 Model | V1-MODEL-REUSE-ISOLATION, V1-PUBLIC-API-DEFAULT |
| INV-04 | covered | compile-static-form-model / 区分数据 container 与展示 group | V1-FIXTURE-PUBLIC-ONLY, V1-PUBLIC-API-DEFAULT |
| INV-05 | covered | bootstrap-monorepo-and-contracts / 区分数组身份与数组地址 | V1-ARRAY-MOVE-STATE |
| INV-06 | covered | add-transactional-form-runtime / Field 与 Form 读取同一嵌套值 | V1-ADAPTER-PORT, V1-PUBLIC-API-DEFAULT |
| INV-07 | covered | add-transactional-form-runtime / setValues 不发布中间字段组合 | V1-ADAPTER-PORT, V1-STABLE-TX, V1-CROSS-STACK-VUE, V1-CROSS-STACK-REACT |
| INV-08 | covered | compile-static-form-model / ViewTree 不泄漏 Render-time state | V1-CROSS-STACK-VUE, V1-CROSS-STACK-REACT, V1-ADAPTER-CHROME |
| INV-09 | covered | bootstrap-monorepo-and-contracts / 在非 DOM 环境验证 Core | V1-PORTABILITY-DEPS, V1-PORTABILITY-NODE, V1-WORKSPACE-LAYOUT |
| INV-10 | covered | add-definition-and-environment / 拒绝 framework binding | V1-CROSS-STACK-VUE, V1-CROSS-STACK-REACT, V1-FIXTURE-PUBLIC-ONLY |
| INV-11 | covered | add-definition-and-environment / 拒绝构建后的 Registry mutation | V1-ADAPTER-PORT, V1-PUBLIC-API-EXPLICIT |
| INV-12 | covered | add-rules-and-schema-dynamics / hidden保持active | V1-PRE-REQUIRED-PRESENTATION, V1-CROSS-STACK-VUE |

## Slices

| ID | Status | Owner | Evidence |
|---|---|---|---|
| SLICE-01 | covered | compile-static-form-model / 编译未声明 dialect 的常用 Schema | V1-PUBLIC-API-DEFAULT, V1-FIXTURE-PUBLIC-ONLY |
| SLICE-02 | covered | compile-static-form-model / 生成嵌套默认 ViewTree | V1-PUBLIC-API-DEFAULT, V1-EXAMPLES |
| SLICE-03 | covered | add-definition-and-environment / 解析默认 text Widget | V1-PRE-WIDGET-INTERACTION, V1-CROSS-STACK-VUE, V1-CROSS-STACK-REACT |
| SLICE-04 | covered | add-vue-element-plus-rendering / Element Plus example完成端到端交互 | V1-CROSS-STACK-VUE, V1-CROSS-STACK-REACT, V1-EXAMPLES |
| SLICE-05 | covered | add-transactional-form-runtime / setValues 不发布中间字段组合 | V1-STABLE-TX, V1-PRECISION-FIELD |
| SLICE-06 | covered | add-array-identity-and-scopes / append 与 insert 原子建立身份 | V1-ARRAY-MOVE-STATE |
| SLICE-07 | covered | add-rules-and-schema-dynamics / State Rule更新effective selector | V1-STABLE-TX, V1-DIAGNOSTIC-SOURCES |
| SLICE-08 | covered | add-validation-pipeline / 规范化required target | V1-STABLE-TX, V1-DIAGNOSTIC-SOURCES |
| SLICE-09 | covered | compile-static-form-model / 条件分支引入不同字段 | V1-PUBLIC-API-DEFAULT, V1-STABLE-TX |
| SLICE-10 | covered | add-definition-and-environment / 拒绝构建后的 Registry mutation | V1-PUBLIC-API-EXPLICIT, V1-DIAGNOSTIC-SOURCES |

## Acceptance criteria

| ID | Status | Owner | Evidence |
|---|---|---|---|
| AC-01 | covered | add-vue-element-plus-rendering / 默认与显式 layout 使用同一遍历入口 | V1-CROSS-STACK-VUE, V1-CROSS-STACK-REACT, V1-CROSS-STACK-COMPARE |
| AC-02 | covered | bootstrap-monorepo-and-contracts / 在非 DOM 环境验证 Core | V1-PORTABILITY-DEPS, V1-PORTABILITY-NODE, V1-DEP-ALLOWLIST |
| AC-03 | covered | compile-static-form-model / 重复编译具有纯函数语义 | V1-MODEL-REUSE-FINGERPRINT, V1-MODEL-REUSE-ISOLATION |
| AC-04 | covered | add-array-identity-and-scopes / touched 和 focused 随 ID move | V1-ARRAY-MOVE-STATE |
| AC-05 | covered | add-transactional-form-runtime / 单字段更新只通知相关 selector | V1-PRECISION-FIELD, V1-PRECISION-ARRAY, V1-RENDER-PRECISION |
| AC-06 | covered | add-rules-and-schema-dynamics / 链式computed按拓扑顺序稳定 | V1-STABLE-TX |
| AC-07 | covered | add-vue-element-plus-rendering / native change 转为一次 setValue | V1-ADAPTER-PORT, V1-ADAPTER-CHROME |
| AC-08 | covered | bootstrap-monorepo-and-contracts / 消费最小 Diagnostic | V1-DIAGNOSTIC-SOURCES, V1-DIAGNOSTIC-STABLE |

## Packages / directories / exports

| ID | Status | Owner | Evidence |
|---|---|---|---|
| PKG-01 | covered | bootstrap-monorepo-and-contracts / 发现全部首期 package | V1-WORKSPACE-LAYOUT |
| PKG-02 | covered | bootstrap-monorepo-and-contracts / 发现全部首期 package | V1-WORKSPACE-LAYOUT |
| PKG-03 | covered | bootstrap-monorepo-and-contracts / 发现全部首期 package | V1-WORKSPACE-LAYOUT |
| PKG-04 | covered | bootstrap-monorepo-and-contracts / 发现全部首期 package | V1-WORKSPACE-LAYOUT |
| PKG-05 | covered | bootstrap-monorepo-and-contracts / 发现全部首期 package | V1-WORKSPACE-LAYOUT |
| PKG-06 | covered | bootstrap-monorepo-and-contracts / 发现全部首期 package | V1-WORKSPACE-LAYOUT |
| DIR-TESTS | covered | bootstrap-monorepo-and-contracts / 验证未修改的合规工作区 | V1-WORKSPACE-LAYOUT |
| DIR-DOCS | covered | bootstrap-monorepo-and-contracts / 验证未修改的合规工作区 | V1-DOCS-INDEX |
| DIR-EX-VUE | covered | add-vue-element-plus-rendering / Element Plus example完成端到端交互 | V1-EXAMPLES |
| DIR-EX-REACT | covered | add-react-mui-rendering / React+MUI 示例覆盖端到端行为 | V1-EXAMPLES |
| DIR-CORE-LAYOUT | covered | align-core-contributions-and-layout / 顶层目录与架构一致 | V1-PRE-CORE-LAYOUT |
| DIR-VALIDATOR | covered | add-validation-pipeline / validator-ajv合法依赖AJV与Core | V1-WORKSPACE-LAYOUT |
| DIR-VUE | covered | add-vue-element-plus-rendering / 应用从根入口组合 Renderer | V1-WORKSPACE-LAYOUT |
| DIR-REACT | covered | add-react-mui-rendering / 消费者只使用根入口 | V1-WORKSPACE-LAYOUT |
| DIR-ELEMENT-PLUS | covered | add-vue-element-plus-rendering / Form wrapper 不接管 Core 状态 | V1-WORKSPACE-LAYOUT |
| DIR-MUI | covered | add-react-mui-rendering / MUI Form 不运行第二套验证 | V1-WORKSPACE-LAYOUT |
| EXP-CORE-ROOT | covered | compile-static-form-model / 导入根入口公共契约 | V1-EXPORT-SURFACE, V1-PUBLIC-API-DEFAULT |
| EXP-CORE-RUNTIME | covered | add-renderer-interaction-and-binding-ports / 导入受支持的子路径 | V1-PRE-RENDER-BINDING, V1-EXPORT-SURFACE |
| EXP-CORE-EXTENSION | covered | compile-static-form-model / 导入受支持的extension子路径 | V1-PRE-WIDGET-HELPER, V1-EXPORT-SURFACE |
| EXP-VALIDATOR-AJV | covered | add-validation-pipeline / validator-ajv合法依赖AJV与Core | V1-EXPORT-SURFACE |
| EXP-VUE | covered | add-vue-element-plus-rendering / 应用从根入口组合 Renderer | V1-EXPORT-SURFACE |
| EXP-REACT | covered | add-react-mui-rendering / 消费者只使用根入口 | V1-EXPORT-SURFACE |
| EXP-ELEMENT-PLUS | covered | add-vue-element-plus-rendering / 应用从根入口组合 Renderer | V1-EXPORT-SURFACE |
| EXP-MUI | covered | add-react-mui-rendering / 消费者只使用根入口 | V1-EXPORT-SURFACE |
| EXP-DEEP-IMPORT-DENY | covered | compile-static-form-model / 拒绝内部 deep import | V1-EXPORT-DEEP-DENY |

## Diagnostic sources

| ID | Status | Owner | Evidence |
|---|---|---|---|
| DIAG-01 | covered | bootstrap-monorepo-and-contracts / 消费最小 Diagnostic | V1-DIAGNOSTIC-SOURCES, V1-DIAGNOSTIC-STABLE |
| DIAG-02 | covered | bootstrap-monorepo-and-contracts / 消费最小 Diagnostic | V1-DIAGNOSTIC-SOURCES, V1-DIAGNOSTIC-STABLE |
| DIAG-03 | covered | bootstrap-monorepo-and-contracts / 消费最小 Diagnostic | V1-DIAGNOSTIC-SOURCES, V1-DIAGNOSTIC-STABLE |
| DIAG-04 | covered | bootstrap-monorepo-and-contracts / 消费最小 Diagnostic | V1-DIAGNOSTIC-SOURCES, V1-DIAGNOSTIC-STABLE |
| DIAG-05 | covered | bootstrap-monorepo-and-contracts / 消费最小 Diagnostic | V1-DIAGNOSTIC-SOURCES, V1-DIAGNOSTIC-STABLE |

## Positive contracts (not deferred)

| ID | Status | Owner | Evidence |
|---|---|---|---|
| POS-VIEW-COLLAPSED-ACTIVETAB | covered | add-renderer-interaction-and-binding-ports / collapsed 与 activeTab 属于具体 View | V1-PRE-VIEW-STATE |
| POS-VALUE-INITIALIZER | covered | align-core-contributions-and-layout / 默认 initializer 填充初始值 | V1-PRE-CONTRIBUTION-PORTS |
| POS-DIALECT-ADAPTER | covered | align-core-contributions-and-layout / 通过 adapter 编译 draft-07 Schema | V1-PRE-CONTRIBUTION-PORTS |
| POS-X-KEYWORD-SPLIT | covered | align-core-contributions-and-layout / x-ui 拆分为 FieldUI | V1-PRE-CONTRIBUTION-PORTS |

## Deferred / optional-unsupported

| ID | Status | Owner | Evidence |
|---|---|---|---|
| DEF-01 | deferred | (none) | V1-DEFERRED-ABSENCE |
| DEF-02 | deferred | (none) | V1-DEFERRED-ABSENCE |
| DEF-03 | deferred | (none) | V1-DEFERRED-ABSENCE |
| DEF-04 | deferred | (none) | V1-DEFERRED-ABSENCE |
| DEF-05 | deferred | (none) | V1-DEFERRED-ABSENCE |
| DEF-06 | deferred | (none) | V1-DEFERRED-ABSENCE |
| DEF-07 | deferred | (none) | V1-DEFERRED-ABSENCE |
| DEF-08 | deferred | (none) | V1-DEFERRED-ABSENCE |

## Prerequisites

| ID | Status | Owner | Entry | Evidence |
|---|---|---|---|---|
| PRE-WIDGET-HELPER | resolved | compile-static-form-model / 保留自定义 Widget identity 与 literal | @form/core/extension | V1-PRE-WIDGET-HELPER |
| PRE-RENDER-BINDING | resolved | add-renderer-interaction-and-binding-ports / RenderScope 不提供 writer | @form/core/runtime | V1-PRE-RENDER-BINDING |
| PRE-BLUR-PORT | resolved | add-renderer-interaction-and-binding-ports / blur 清除目标 View 的 focused | @form/core | V1-PRE-BLUR-PORT |
| PRE-WIDGET-INTERACTION | resolved | compile-static-form-model / 默认 Widget 提供完整 semantic action capability | @form/core/extension | V1-PRE-WIDGET-INTERACTION |
| PRE-REQUIRED-PRESENTATION | resolved | add-renderer-interaction-and-binding-ports / 静态required直接投影 | @form/core | V1-PRE-REQUIRED-PRESENTATION |
| PRE-VIEW-STATE | resolved | add-renderer-interaction-and-binding-ports / collapsed 与 activeTab 属于具体 View | @form/core | V1-PRE-VIEW-STATE |
| PRE-CORE-LAYOUT | resolved | align-core-contributions-and-layout / 顶层目录与架构一致 | check:boundaries | V1-PRE-CORE-LAYOUT |
| PRE-CONTRIBUTION-PORTS | resolved | align-core-contributions-and-layout / Plugin注册dialect、extension与initializer providers | @form/core/extension | V1-PRE-CONTRIBUTION-PORTS |

