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

### Requirement: compileForm 提供纯编译 Application API
`@form/core` 必须（SHALL）从根入口暴露 `compileForm(definition, options?)` 与其 options 契约。未提供 Environment 时必须（MUST）使用默认 Core Environment；提供 Environment 时必须（MUST）只消费该冻结 Environment。编译不得（MUST NOT）创建 `FormInstance`、读取或修改 global mutable state，或修改 Definition 与 Environment 输入。

#### Scenario: 使用默认 Environment 编译
- **GIVEN** 一个只使用 Core 内置逻辑 Widget 的合法 `FormDefinition`
- **WHEN** 调用者执行 `compileForm(definition)`
- **THEN** 返回包含始终存在的 `CompiledFormModel` 与只读 diagnostics 的 `CompileResult`

#### Scenario: 使用显式 Environment 编译
- **GIVEN** 一个由业务 Plugin 提供自定义 Widget 的冻结 `FormEnvironment`
- **WHEN** 调用者执行 `compileForm(definition, { environment })`
- **THEN** Widget 仅从该 Environment 的 Registry 解析，且编译不向 Registry 注册或替换任何 contribution

#### Scenario: 重复编译具有纯函数语义
- **GIVEN** 语义相同且期间未改变的 Definition 与 Environment
- **WHEN** 重复执行编译
- **THEN** 两次结果具有相同的 Model 结构、ID、遍历顺序和 diagnostics，且没有跨调用 Runtime 或可变编译缓存状态

### Requirement: 编译产物在运行时保持不可变和阶段隔离
成功编译产生的 `CompiledFormModel`、所有公开嵌套对象、collection view 与 diagnostics 必须（MUST）在受支持的运行时 API 下不可修改。Model 必须（MUST）只包含 compile-time Data、UI、Rule、Validation、Schema Dynamics 与 diagnostic view，不得（MUST NOT）暴露 `CompilerContext`、Shape internals、instance values、`ArrayItemId` sidecar、Store、Transaction、Scheduler 或 Renderer state。

#### Scenario: 拒绝修改已编译 Model
- **GIVEN** 调用者持有成功返回的 Model 及其 node map、Field map、ViewTree 和 diagnostics
- **WHEN** 调用者尝试通过公开对象替换成员或添加、删除、重排条目
- **THEN** 类型契约拒绝该操作，且运行时观察到的编译产物保持不变

#### Scenario: Model 不包含 Runtime state
- **GIVEN** 一个包含数组、conditional Schema 与多个 FieldView 的编译结果
- **WHEN** 下游检查 `CompiledFormModel`
- **THEN** 只能看到静态模板与来源信息，看不到数组项身份、当前 `InstancePath`、values、touched、focused 或 effective active/visible state

### Requirement: 编译成功与失败共享确定的 Diagnostic 语义
能够产生合法 Model 的 inference、部分支持与 deprecated syntax 问题必须（MUST）作为确定排序的非阻断 diagnostics 返回，并与 `CompiledFormModel.diagnostics` 保持语义一致。任何阻断问题必须（MUST）抛出包含一条或多条只读 error diagnostics 的 `CompileError`，且不得（MUST NOT）返回 partial model。

#### Scenario: 成功返回非阻断 Diagnostic
- **GIVEN** Schema 可生成合法 Model，但某个 shape 由 structural keyword 推导
- **WHEN** 编译完成
- **THEN** `CompileResult.model` 存在，且结果与 Model diagnostics 都包含可按稳定 code、source 和位置检查的 inference warning

#### Scenario: 聚合阻断问题而不发布 partial model
- **GIVEN** UI Schema 同时引用不存在的 `ModelPath` 并指定未注册 Widget
- **WHEN** 编译器能够安全发现两个独立问题
- **THEN** 抛出的 `CompileError` 按确定顺序包含两条 error diagnostics，且调用者得不到部分 `CompiledFormModel`

### Requirement: 受支持的 export 隔离内部模块
`@form/core`必须（SHALL）从package根入口暴露面向应用的authoring、compile、instantiate与实例facade契约，包括`defineForm`、`compileForm`、`CompileResult`/`CompileError`、只读`CompiledFormModel`及其Data/UI/Rule/Validation/Schema Dynamics model view、`createForm`、`createFormEngine`、`FormEngine`、基础`FormInstance`/`FieldInstance`、`ArrayInstance`、`ScopedFormInstance`、`ArrayItemId`、effective state、`serialize()`及其readonly options/result和结构化Runtime failure。只读selector、subscription、snapshot、array binding、effective-state selector、Identity Resolver与Runtime diagnostic observation必须（MUST）从显式支持的`@form/core/runtime`子路径获得；`definePlugin`、`defineWidget`、`createFormEnvironment`、`defineRuleFunction`、`WidgetDefinition`及Rule Function/Serializer provider契约继续从`@form/core/extension`获得。Package export map必须（SHALL）拒绝未声明的deep import，并将可变Store、Environment identity token、Compiler Context、Schema Frontend/Shape Analyzer implementation、Dependency Graph/Scheduler、Transaction Manager、Change Queue、phase/RuleEngine/AST evaluator、activation writer、serializer execution context、array binding/cleanup writer、ID generator和`RuntimeNodeId` generation保持私有。

#### Scenario: 导入根入口公共契约
- **GIVEN** 外部消费者从`@form/core`导入`compileForm`、`CompileResult`、create/instance/array/scope契约、Rule/Dynamics readonly Model、effective snapshot或serialization options
- **WHEN** 通过package exports解析fixture并执行类型检查
- **THEN** Application API可与`defineForm`、`compileForm`及readonly Model共同使用，并可调用`array()`、`scope()`与`serialize()`

#### Scenario: 导入受支持的子路径
- **GIVEN** Framework binding或高级消费者从`@form/core/runtime`导入readonly selector、subscription、array binding、effective-state selector、Identity Resolver或Runtime diagnostic observation
- **WHEN** 解析fixture并执行类型检查
- **THEN** import仅通过该显式子路径成功，且返回契约不含mutation Store、Scheduler writer、Rule evaluator或activation writer

#### Scenario: 导入受支持的extension子路径
- **GIVEN** extension author从`@form/core/extension`导入`defineRuleFunction`、Rule Function与Serializer provider contract
- **WHEN** 定义Plugin contribution并执行类型检查
- **THEN** import成功且这些provider仍受frozen Environment/Registry约束

#### Scenario: 从 Extension 子路径声明 Widget
- **GIVEN** 扩展作者从`@form/core/extension`导入`defineWidget`、`WidgetDefinition`与Environment contract
- **WHEN** 通过package exports解析consumer fixture并执行类型检查
- **THEN** identity-preserving Widget authoring与只读Extension类型可从该子路径使用，且不要求导入任何internal compiler/runtime文件

#### Scenario: 根入口不重导出 Advanced 或 Extension factory
- **GIVEN** 消费者尝试从`@form/core`导入selector factory、Identity Resolver、`definePlugin`、`defineWidget`、`createFormEnvironment`或`defineRuleFunction`
- **WHEN** 对consumer fixture执行类型检查
- **THEN** import因角色级export不属于根入口而失败

#### Scenario: 拒绝内部 deep import
- **GIVEN** 外部消费者导入未声明的Core compiler、schema frontend、rule、dynamics、scheduler、runtime、transaction、store、array binding或engine implementation路径
- **WHEN** 使用package exports解析fixture
- **THEN** 即使内部源文件存在，解析仍然失败

#### Scenario: 根导出不包含内部符号
- **GIVEN** 外部消费者尝试从`@form/core`导入`RuntimeNodeId`、Compiler Context、`ArrayStateStore`、`RuleEngine`、`DependencyScheduler`、AST evaluator、activation writer、`TransactionManager`、`ChangeQueue`、mutable Store、phase implementation、Scheduler、subtree cleanup writer、array binding table、identity generator或Environment identity token
- **WHEN** 对consumer fixture执行类型检查
- **THEN** import因这些符号不属于根公共表面而失败

#### Scenario: 所有公共入口均不泄漏 Runtime internals
- **GIVEN** 外部消费者尝试从root、runtime或extension入口取得Rule/activation/serialization writer、mutable dependency graph、Compiler Context、RuntimeNodeId或其他等价escape hatch
- **WHEN** 对fixtures和生成declaration执行检查
- **THEN** 所有内部import均失败，公开interface只能author、inspect、select、subscribe或调用受控Application command
