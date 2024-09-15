# form-definition-authoring Specification

## Purpose

为应用与工具提供稳定、框架无关且类型推导友好的 Form Definition authoring 边界，使同一份定义可安全进入后续编译流程并跨 Renderer 技术栈复用。

## Requirements

### Requirement: Form Definition 组合四类 authoring 输入
Core 必须（SHALL）接受由必需 `schema` 与可选 `uiSchema`、`rules`、`config` 组成的只读 `FormDefinition`。`schema` 必须（MUST）表达 Draft 2020-12 JSON Schema 输入，包括 object schema 与 boolean schema。

#### Scenario: 声明最小 Definition
- **GIVEN** 调用者提供一个 Draft 2020-12 object schema
- **WHEN** 调用者创建仅含 `schema` 的 `FormDefinition`
- **THEN** 该 Definition 满足公共类型契约，无需提供 UI、Rule 或 Form Config

#### Scenario: 声明完整 Definition
- **GIVEN** 调用者持有 JSON Schema、按 `ModelPath` 索引的 UI Schema、Rule Definitions 与 Form Config
- **WHEN** 调用者把四类输入组合为 `FormDefinition`
- **THEN** 公共契约分别保留这些输入的职责与只读类型

#### Scenario: 接受 boolean schema 边界
- **GIVEN** 调用者使用 `true` 或 `false` 作为合法 JSON Schema
- **WHEN** 该值被用作 Definition 的 `schema`
- **THEN** 公共类型契约接受该 Definition

### Requirement: defineForm 是无副作用 authoring helper
Core 必须（SHALL）从 `@form/core` 根入口暴露 `defineForm()`。该 helper 必须（MUST）保留输入 Definition 的语义和具体类型信息，并且不得（MUST NOT）执行 Schema 编译、创建 `FormInstance`、安装 Plugin 或读取或修改 global mutable state。

#### Scenario: 通过 defineForm 保留 Definition
- **GIVEN** 调用者提供包含具体字段、Widget 名称、Rules 与 Config 的 Definition literal
- **WHEN** 调用 `defineForm()`
- **THEN** 返回值保持这些 authoring 内容与可用的具体类型推导，且不包含 Compiled Model 或 Runtime state

#### Scenario: 重复 authoring 不产生跨调用状态
- **GIVEN** 两个语义相同但独立创建的 Definition 输入
- **WHEN** 分别调用 `defineForm()`
- **THEN** 两次调用不共享新增的可变 Registry、Runtime 或编译缓存状态

### Requirement: Definition 与编译和运行阶段保持分离
`FormDefinition` 与 `defineForm()` 返回类型不得（MUST NOT）暴露 compiled state、instance values、Field state、Store、framework component、DOM event 或具体 Validator 实例。Definition 中的 Path authoring 位置必须（MUST）使用 `ModelPathLike`，不得要求 `InstancePath`。

#### Scenario: 拒绝 Runtime state 成员
- **GIVEN** 调用者尝试把 `values`、`touched` 或可变 Store 声明为标准 Definition 成员
- **WHEN** TypeScript 检查该 Definition
- **THEN** 公共契约拒绝这些不属于 authoring 阶段的成员

#### Scenario: 拒绝 Renderer 与 Validator 实现成员
- **GIVEN** 调用者尝试把 Vue/React component、DOM event 或 AJV instance 声明为标准 Definition 成员
- **WHEN** TypeScript 检查该 Definition
- **THEN** 公共契约拒绝这些 framework 或具体 adapter 实现

#### Scenario: UI 字段使用 ModelPath
- **GIVEN** 调用者为数组项字段声明 UI 配置
- **WHEN** 使用 `products[].name` 标识字段定义位置
- **THEN** 该键按 `ModelPathLike` 处理，而不是绑定某个数组 index 的 `InstancePath`

### Requirement: Rule AST 是可序列化且可静态提取依赖的表达式
`FormDefinition.rules`必须（MUST）使用readonly、JSON-compatible的`RuleExpression`：finite scalar literal、显式`const` JSON值、`field: ModelPathLike`、`call`加readonly args，以及固定的`eq`、`ne`、`lt`、`lte`、`gt`、`gte`、`in`、`all`、`any`、`not`表达式。每个operator object必须（MUST）恰好表达一个operator；Definition不得（MUST NOT）内嵌JavaScript function、Promise、dynamic Path、Store、FormInstance或Runtime state。

#### Scenario: 声明可分析的field与call表达式
- **GIVEN** author使用`{ eq: [{ field: "country" }, "CN"] }`并以`{ call: "company.compute", args: [...] }`计算结果
- **WHEN** 通过`defineForm()`声明Definition
- **THEN** literal、named call和每个`ModelPathLike`保留在readonly AST中，可由Compiler确定遍历而不执行function

#### Scenario: object常量与operator保持无歧义
- **GIVEN** Rule需要把object/array作为常量
- **WHEN** 使用`{ const: jsonValue }`而不是带任意key的普通对象
- **THEN** Compiler能区分常量与operator node，且整个AST仍可序列化

#### Scenario: 拒绝内嵌function或Runtime对象
- **GIVEN** author把callback、Promise、FormInstance或动态读取函数放入Rule表达式
- **WHEN** 执行TypeScript检查或Compiler输入校验
- **THEN** 输入被拒绝并产生可定位Rule Diagnostic，不能借AST绕过Registry或transaction

### Requirement: 四类Rule拥有互不混淆的声明式action
`RuleDefinition`必须（MUST）以`kind`形成discriminated union并包含可选stable author ID、scope target及可选boolean`when`。State Rule的action只声明`active/visible/disabled/readonly`表达式；Computed Rule只声明单一value表达式；Validation Rule只声明boolean assertion与readonly failure metadata；Effect Rule只声明有序`setValue` actions及其静态`ModelPathLike` target/value expression。`defineForm()`必须（MUST）保留各category的literal inference且不求值。

#### Scenario: 声明State与Computed Rule
- **GIVEN** author分别声明visible状态表达式和computed total表达式
- **WHEN** TypeScript根据`kind`检查action
- **THEN** 两种action字段准确推导，State action不能写value且Computed action不能声明validation issue

#### Scenario: 声明Validation Rule而不内嵌ValidationError
- **GIVEN** author声明target、assertion以及code/message/JSON params failure metadata
- **WHEN** Definition通过authoring检查
- **THEN** 结构可供后续Validation owner转换，但不包含instancePath、async token、server source或Runtime `ValidationError`

#### Scenario: Effect只接受setValue action
- **GIVEN** author尝试在Effect中声明touch、submit、fetch、array structural command或任意callback
- **WHEN** TypeScript或Compiler检查RuleDefinition
- **THEN** 这些action不属于受支持union，只有静态target的声明式`setValue`可接受

### Requirement: Form Config 可声明默认serialization policy
`FormConfig`可以（MAY）以`serializeInactive`声明默认是否包含inactive值，并以named serializer key声明默认Serializer；两者必须（MUST）保持readonly、框架无关且不包含provider function。Runtime调用option可以覆盖这些默认值，但不改变Definition或Compiled Model。

#### Scenario: 声明active-only named serialization
- **GIVEN** author配置`serializeInactive: false`和serializer key`company.payload`
- **WHEN** 使用`defineForm()`创建Definition
- **THEN** 两个literal配置被保留供Compiler校验，不执行serializer或创建Runtime
