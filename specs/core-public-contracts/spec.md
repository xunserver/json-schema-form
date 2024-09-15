# core-public-contracts Specification

## Purpose

定义稳定且框架无关的类型与受支持 import 表面，使下游 Compiler、Runtime、Validator、Renderer、Adapter 和应用无需依赖 Core 内部实现即可共享契约。

## Requirements

### Requirement: Path 契约区分 Schema、Model 和 Instance 位置
Core 必须（SHALL）暴露彼此不同的只读 `SchemaPath`、`ModelPath` 和 `InstancePath` 契约。公共 authoring 和 command 边界可以（MAY）接受对应的字符串形式输入，但未经显式解析或转换，一个类别的 typed path 不得（SHALL NOT）赋值给另一个类别。

#### Scenario: 使用正确的 Path 类别
- **GIVEN** 消费者持有形如 `products[].name` 的 `ModelPath`
- **WHEN** 将其传给要求 `ModelPath` 的公共契约
- **THEN** TypeScript 接受该值，且内部无需将其弱化为未分类字符串

#### Scenario: 在需要 InstancePath 时拒绝 ModelPath
- **GIVEN** 消费者持有一个 `ModelPath`
- **WHEN** 将其传给要求 `InstancePath` 的契约
- **THEN** 静态类型检查拒绝该不匹配值

#### Scenario: 保留 Schema 诊断位置
- **GIVEN** 一条 Diagnostic 指向 `#/properties/products/items`
- **WHEN** 通过公共 Diagnostic 契约暴露该位置
- **THEN** 该位置表示为 `SchemaPath`，而不是 `ModelPath` 或 `InstancePath`

### Requirement: 公共实体 ID 在类型上彼此独立
Core 必须（SHALL）暴露 nominal public ID 契约 `DataNodeId`、`ViewNodeId` 和 `ArrayItemId`，使不同实体类别的 ID 无法意外互换。内部 `RuntimeNodeId` 不得（SHALL NOT）从任何公共入口获得。

#### Scenario: 区分数组身份与数组地址
- **GIVEN** 消费者持有一个 `ArrayItemId` 和该数组项当前的 `InstancePath`
- **WHEN** 数组项改变 index
- **THEN** 公共契约继续将稳定 ID 和当前 Path 作为类型不同的两个值处理

#### Scenario: 拒绝不相关的 ID
- **GIVEN** 某 API 要求 `DataNodeId`
- **WHEN** 消费者传入 `ViewNodeId`
- **THEN** 静态类型检查拒绝该值

#### Scenario: 阻止导入 RuntimeNodeId
- **GIVEN** 下游 package 尝试从 Core 根入口或受支持子路径导入 `RuntimeNodeId`
- **WHEN** 对其公共契约 fixture 执行类型检查
- **THEN** 因该符号未导出而导致 import 失败

### Requirement: Diagnostic 使用共享结构化契约
Core 必须（SHALL）暴露只读 `Diagnostic` 契约，其中包含 `code`、`severity`、`message` 和 `source`，并可选包含 `schemaPath`、`modelPath`、`pluginId` 与只读 metadata。Diagnostic severity 和 source 必须（SHALL）是适合穷举处理的有限公共 union。

#### Scenario: 消费最小 Diagnostic
- **GIVEN** 生产者报告一条具有必需 code、severity、message 和 source 字段的问题
- **WHEN** 下游消费者通过公共 `Diagnostic` 契约处理该问题
- **THEN** 消费者无需依赖问题来源子系统即可读取这些字段

#### Scenario: 附加精确的可选上下文
- **GIVEN** 一条 Compiler Diagnostic 同时关联 Schema 和 Model 位置
- **WHEN** 对外表示该 Diagnostic
- **THEN** 两个位置分别使用 `SchemaPath` 和 `ModelPath`，且 metadata 对消费者保持只读

### Requirement: Form Definition 契约只用于 authoring
Core 必须（SHALL）暴露只读 `FormDefinition` 契约，其中包含必需 JSON Schema 以及可选 UI Schema、Rule Definition 和 Form Config。Definition 契约不得（SHALL NOT）包含 compiled state、runtime state、框架组件、DOM event 或具体 Validator 类型。

#### Scenario: 声明最小 Form Definition
- **GIVEN** 一个 Draft 2020-12 JSON Schema
- **WHEN** 消费者创建满足 `FormDefinition` 的值
- **THEN** 只有 Schema 是必需项，且该值保持独立于 Renderer 和 Validator package

#### Scenario: 拒绝 Definition 中的 Runtime state
- **GIVEN** 消费者尝试把可变 Field state 或框架组件作为标准 `FormDefinition` 成员
- **WHEN** 对 Definition 执行类型检查
- **THEN** 公共契约不提供此类成员

### Requirement: Compiled Model 契约只读且阶段分离
Core 必须（SHALL）将 `CompiledFormModel` 暴露为只读模板，包含 Data、UI、Rule、Validation 和 Schema Dynamics model view 以及 model diagnostics。它不得（SHALL NOT）暴露 FormInstance values、可变 Store、Transaction Manager、Scheduler 或 Renderer state。

#### Scenario: 检查 Compiled Model
- **GIVEN** 下游工具收到一个 `CompiledFormModel`
- **WHEN** 通过公共类型检查该 Model
- **THEN** 工具可以读取五个 Model domain 和 diagnostics，但无法访问可变 Runtime 实现对象

#### Scenario: 阻止通过公共 Model 类型修改内容
- **GIVEN** 消费者持有一个 `CompiledFormModel`
- **WHEN** 尝试替换某个 Model domain 或修改 Model 暴露的只读集合
- **THEN** 静态类型检查拒绝该修改

#### Scenario: 分离 Compiled state 与 Runtime state
- **GIVEN** 未来将从同一个 Compiled Model 创建多个 FormInstance
- **WHEN** 检查 Compiled Model 契约
- **THEN** 其中不包含任何实例级 values、touched state、validation run state、array-item state 或 view interaction state

### Requirement: 编译结果具有明确的成功与失败契约
Core 必须（SHALL）暴露 `CompileResult`，其中 `CompiledFormModel` 始终存在且 diagnostics 为只读；对于无法生成合法 Model 的失败，必须暴露结构化 `CompileError`。

#### Scenario: 表示成功编译契约
- **GIVEN** 编译能够生成合法 Model，同时产生非阻断 warning
- **WHEN** 消费编译结果
- **THEN** `model` 始终存在，且 warning 可通过只读 diagnostics 获取

#### Scenario: 表示阻断性编译失败
- **GIVEN** 编译无法生成合法 Model
- **WHEN** 失败跨越公共边界
- **THEN** 该失败表示为带结构化 diagnostics 的 `CompileError`，而不是 `model` 可选的成功结果

### Requirement: 受支持的 export 隔离内部模块
`@form/core` 必须（SHALL）从 package 根入口暴露面向应用的 authoring、compile、instantiate 与实例 facade 契约，包括 `createForm`、`createFormEngine`、`FormEngine`、基础 `FormInstance`/`FieldInstance`、`ArrayInstance`、`ScopedFormInstance`、`ArrayItemId` 和结构化 Runtime failure。只读 selector、subscription、snapshot、array binding、Identity Resolver 与 Runtime diagnostic observation 必须（MUST）从显式支持的 `@form/core/runtime` 子路径获得，Extension 契约继续从 `@form/core/extension` 获得。Package export map 必须（SHALL）拒绝未声明的 deep import，并将可变 Store、Environment identity token、Compiler Context、Dependency Graph、Transaction Manager、Change Queue、phase implementation、Scheduler、array binding/cleanup writer、ID generator 和 `RuntimeNodeId` generation 保持私有。

#### Scenario: 导入根入口公共契约
- **GIVEN** 外部消费者从 `@form/core` 导入 `createForm`、`createFormEngine`、`FormInstance`、`FieldInstance`、`ArrayInstance`、`ScopedFormInstance`、`ArrayItemId` 或 Runtime failure contract
- **WHEN** 通过 package exports 解析 fixture 并执行类型检查
- **THEN** 这些 Application API 可以与根入口的 `defineForm`、`compileForm` 及只读 Model 契约共同使用，并可调用 `array()` 与 `scope()`

#### Scenario: 导入受支持的子路径
- **GIVEN** Framework binding 或高级消费者从 `@form/core/runtime` 导入只读 selector、subscription、snapshot、array binding、Identity Resolver 或 Runtime diagnostic observation contract
- **WHEN** 解析 fixture并执行类型检查
- **THEN** import 仅通过该显式子路径成功，且返回契约不包含公开 mutation Store、binding writer 或 ID generator

#### Scenario: 根入口不重导出 Advanced 或 Extension factory
- **GIVEN** 消费者尝试从 `@form/core` 导入 selector factory、Identity Resolver helper、subscription helper、`definePlugin` 或 `createFormEnvironment`
- **WHEN** 对 consumer fixture 执行类型检查
- **THEN** import 因角色级 export 不属于根入口而失败

#### Scenario: 拒绝内部 deep import
- **GIVEN** 外部消费者导入未声明的 Core runtime、transaction、store、array binding 或 engine implementation 文件路径
- **WHEN** 使用 package exports 解析 fixture
- **THEN** 即使内部源文件存在，解析仍然失败

#### Scenario: 根导出不包含内部符号
- **GIVEN** 外部消费者尝试从 `@form/core` 导入 `RuntimeNodeId`、`ArrayStateStore`、`TransactionManager`、`ChangeQueue`、mutable Store、phase implementation、Scheduler、subtree cleanup writer、array binding table、identity generator 或 Environment identity token
- **WHEN** 对 consumer fixture 执行类型检查
- **THEN** import 因这些符号不属于根公共表面而失败

#### Scenario: 所有公共入口均不泄漏 Runtime internals
- **GIVEN** 外部消费者尝试从根入口、runtime 或 extension 子路径导入 `RuntimeNodeId`、`ArrayStateStore`、`TransactionManager`、`ChangeQueue`、mutable Store、phase implementation、Scheduler、subtree cleanup writer、array binding table、identity generator 或 Environment identity token
- **WHEN** 对 fixture 和生成 declaration 执行检查
- **THEN** 所有 import 均失败，且公开 interface 不提供等价的 mutable escape hatch
