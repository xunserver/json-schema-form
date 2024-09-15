# vue-renderer-environment Specification

## Purpose

定义 Vue framework 自有、显式且冻结的 RendererEnvironment 与 VueUIAdapter 协议，使逻辑 Widget/View 能确定绑定到 Vue render 能力，同时与 Core FormEnvironment、状态真相和内部 Runtime 保持隔离。

## Requirements

### Requirement: RendererEnvironment 与 FormEnvironment 严格分离
`@form/vue` 必须（SHALL）让 Renderer binding 通过显式 Vue `RendererEnvironment`/`VueUIAdapter` 输入构建，不得（MUST NOT）注册进 Core `FormEnvironment`、修改 `WidgetDefinition`/`CompiledFormModel`，或读取 global mutable Registry。逻辑 Widget key 可以在两个 environment 中对应，但 Core environment identity 与 Renderer environment identity 不得互换或合并。

#### Scenario: 同一模型选择不同 Vue adapter
- **GIVEN** 同一 `CompiledFormModel` 的逻辑 Widget 已解析，调用者分别提供两个独立 VueUIAdapter
- **WHEN** 创建两个 Renderer tree
- **THEN** 它们可产生不同 Vue 呈现但共享相同 Core 语义，任一 Renderer registry 不会改变 FormEnvironment 或另一实例

#### Scenario: 拒绝把 Vue component 注册进 Core
- **GIVEN** extension 尝试把 Vue component 或 render callback 作为 Core WidgetDefinition/provider
- **WHEN** 执行公共类型或 environment shape 检查
- **THEN** framework value 不满足 Core extension contract，必须改由 RendererEnvironment binding 提供

### Requirement: VueUIAdapter 明确组合四类职责
VueUIAdapter 必须（MUST）以稳定 adapter ID 提供 FormAdapter、FieldChromeAdapter、WidgetAdapterRegistry 与 LayoutAdapterRegistry，并声明自身 protocol version/capabilities。Widget/Layout binding 必须（MUST）按已解析的逻辑 key/View kind 工作；Adapter 可以（MAY）提供 Vue 专属 custom render binding，但 custom render 只能接收 readonly descriptor/snapshots/scope view 与 semantic interaction port，不得（MUST NOT）取得 Store writer、Transaction Manager、Validation writer 或 Schema/Rule evaluator。

#### Scenario: custom Widget 使用显式 escape hatch
- **GIVEN** Core 已把一个 custom logical Widget key 编译进 FieldDescriptor，且 VueUIAdapter 为该 key 显式注册 custom render binding
- **WHEN** FieldRenderer preflight 并呈现该 Field
- **THEN** custom render 获得 readonly controlled inputs和semantic commands，不需要把 Vue component 写入 Definition、Core Plugin 或 Compiled Model

#### Scenario: custom render 不暴露直接写入口
- **GIVEN** custom render callback 检查其公开上下文
- **WHEN** 尝试取得 mutable values/errors、FormInstance writer 或 native event passthrough
- **THEN** contract 不提供这些能力，业务修改只能调用受控 semantic interaction port

### Requirement: Environment 构建先校验再冻结发布
RendererEnvironment builder 必须（MUST）先校验 adapter ID、protocol compatibility、四类 role shape、Widget/Layout key 与声明 capability，再原子发布深只读 environment/registry view。成功后不得（MUST NOT）添加、删除或替换 binding；失败必须（MUST）抛出不含 partial environment 的结构化 `RendererEnvironmentBuildError`，其 diagnostics 使用 `source: "adapter"` 与稳定 code。

#### Scenario: 成功 environment 不可变
- **GIVEN** 一个 role 与 registry 均合法的 VueUIAdapter
- **WHEN** RendererEnvironment 成功构建
- **THEN** 重复 lookup 结果确定且公开集合冻结，调用者不能在 Form mount 后替换某个 Widget binding

#### Scenario: malformed adapter 原子失败
- **GIVEN** adapter 缺少 FieldChrome role且一个 Widget binding 的 codec/capability shape 非法
- **WHEN** 构建 RendererEnvironment
- **THEN** error 聚合稳定 adapter diagnostics 且不返回可供 FormRenderer 使用的 partial environment

### Requirement: Registry 冲突不得依赖最后写入
同一 RendererEnvironment 中重复 adapter ID、同一 adapter 下重复 Widget key 或 Layout key 必须（MUST）默认阻断构建。若 composition API 支持 override，则 override 必须（MUST）以精确的 adapter/registry/key/expected-owner allowlist 声明；未匹配、歧义或 wildcard override 必须（MUST）失败，结果顺序不得（MUST NOT）依赖对象遍历或 import timing。

#### Scenario: 重复 Widget binding 被拒绝
- **GIVEN** 两个 contribution 都为 adapter `element-plus` 注册 `text` binding且没有精确 override
- **WHEN** 构建 RendererEnvironment
- **THEN** build error 指出 adapter、registry、key 与两个 owner，不会静默选择最后一个

#### Scenario: 精确 override 可审计
- **GIVEN** 调用者明确允许 owner `app` 替换 owner `element-plus` 的 `widgets/text`
- **WHEN** key 与 expected owner 全部匹配
- **THEN** environment 只替换该 entry并保留只读 provenance，其他冲突仍失败

### Requirement: Capability preflight 不静默降级
FormRenderer 必须（MUST）在挂载相关 native subtree 前核对最终 ViewTree 所需的 logical Widget、View/Layout kind、value codec 与 interaction/accessibility capability。缺失或不兼容能力必须（MUST）产生带 adapter ID、logical key、`ViewNodeId` 及适用 `ModelPath` 的结构化 adapter diagnostic，并阻止该不完整 subtree；不得（MUST NOT）猜测另一个 Widget、改用 HTML fallback、重新解析 Schema 或忽略必需 capability。显式 custom render binding 可以（MAY）满足同一声明能力。

#### Scenario: 缺失 Widget binding 可定位失败
- **GIVEN** ViewTree 含 `datetime` Field，但选择的 adapter 没有 `datetime` 或兼容 custom binding
- **WHEN** FormRenderer 执行 capability preflight
- **THEN** 以稳定 code 报告 adapter/key/View/Model 位置且不挂载错误的 native field，不回写 Core diagnostic 或 values

#### Scenario: mapper 或 render failure 保持分层
- **GIVEN** 已注册 binding 的 mapper/codec/render callback 抛异常或返回 malformed result
- **WHEN** Renderer 调用该能力
- **THEN** failure 被转换为不泄漏 values/内部对象的 `source: "adapter"` operational diagnostic，不能伪装成 ValidationError或产生部分 semantic mutation
