# schema-frontend-and-shape-analysis Specification

## Purpose

为 Core 提供确定、语义保真的 Draft 2020-12 Schema Frontend 与结构推导边界，使静态模型能够追踪来源、保留引用和组合语义，并对无法可靠生成表单的合法 Schema 明确诊断。

## Requirements

### Requirement: Schema Frontend 识别并 meta-validate Draft 2020-12
Schema Frontend 必须（SHALL）将缺失 `$schema` 的输入按 canonical Draft 2020-12 处理，并接受声明 canonical Draft 2020-12 meta-schema URI 的 object 或 boolean Schema。它必须（MUST）在 shape 编译前校验已知 keyword 的 Draft 2020-12 结构；malformed Schema 或未支持 dialect 必须（MUST）以带 `SchemaPath` 的阻断 Diagnostic 失败，且 Core 不依赖 AJV 完成此检查。

#### Scenario: 编译未声明 dialect 的常用 Schema
- **GIVEN** 一个未提供 `$schema`、包含 Object、Array 与 Scalar 的合法 Schema
- **WHEN** Schema Frontend 处理该输入
- **THEN** 该输入按 Draft 2020-12 进入后续编译，不产生 dialect 错误

#### Scenario: 拒绝 malformed keyword
- **GIVEN** `required` 或 `properties` 使用了不符合 Draft 2020-12 的值形状
- **WHEN** Schema Frontend 执行 meta-validation
- **THEN** 编译以稳定 error code 和精确 `SchemaPath` 失败，而不是继续猜测 shape

#### Scenario: 拒绝未支持 dialect
- **GIVEN** 根 Schema 声明一个非 Draft 2020-12 且当前没有受支持转换路径的 `$schema`
- **WHEN** 执行编译
- **THEN** 抛出说明 dialect URI 的结构化 `CompileError`，且不静默按 Draft 2020-12 解释

### Requirement: Reference resolution 保留 Schema Graph
Schema Frontend 必须（SHALL）在 Definition 内根据 `$id` base、JSON Pointer 与 `$anchor` 确定地解析 `$ref`，将共享目标保持为 Schema Graph 关系而非无条件 inline。无法解析或需要未显式提供的 external resource 的引用必须（MUST）阻断编译；合法 reference cycle 不得（MUST NOT）因无限遍历而失败。

#### Scenario: 多处引用同一 `$defs` 节点
- **GIVEN** 两个 properties 通过 `$ref` 指向同一个 `$defs` Schema
- **WHEN** 构建 canonical Schema Graph
- **THEN** 两条引用边指向同一 canonical schema target，而后续 Data Tree 仍可按两个结构位置分别实例化

#### Scenario: 保留 Draft 2020-12 的 ref sibling
- **GIVEN** 一个 `$ref` 节点同时包含合法的 sibling assertions 或 annotations
- **WHEN** 执行 normalization
- **THEN** 引用与 sibling 语义都被保留，不把该节点按旧 dialect 规则简化为仅剩 `$ref`

#### Scenario: 识别递归引用和未解析引用
- **GIVEN** 一个 Definition-local self-reference 与另一个无法解析的 external `$ref`
- **WHEN** 解析 reference graph
- **THEN** self-reference 被记录为 cycle edge，而 external 引用产生带来源位置的阻断 Diagnostic

### Requirement: Normalization 不消除 JSON Schema 语义复杂性
Normalization 必须（SHALL）只消除已支持的输入语法与 canonical 表示差异，并保留 boolean Schema、annotations、assertions、`$ref`、`allOf`、`oneOf`、`anyOf`、`if/then/else` 与 `dependentSchemas` 的语义及来源。Derived metadata 必须（MUST）可追溯到原始 `SchemaPath`，不得（MUST NOT）伪装为原始 keyword。

#### Scenario: 保留 boolean 与 applicator 语义
- **GIVEN** Schema 同时包含 boolean subschema、`allOf` 与 conditional applicator
- **WHEN** 完成 normalization
- **THEN** 输出仍能区分各 applicator 和各自来源，不把它们暴力 merge 为单一伪造 Schema

#### Scenario: 未声明的 x 扩展不成为内部核心协议
- **GIVEN** Schema 包含未由当前 Environment 声明语义的 `x-*` keyword
- **WHEN** Schema Frontend 处理该节点
- **THEN** Core 不把它静默解释为 UI、Rule 或 Config，并产生可定位的 unsupported-extension Diagnostic

### Requirement: Shape Analyzer 推导可诊断的有效结构
Shape Analyzer 必须（SHALL）在不执行 instance validation 且不读取 UI Schema 的情况下推导 Scalar、Object、Array list/tuple、Union、Any、Never 与纯 Null/nullable shape。缺失 `type` 时只能（MUST）由明确 structural keywords 推导并产生 inference Diagnostic；`enum`、`const` 和 `format` 不得（MUST NOT）改变 shape，但必须（MUST）保留给 Widget 与后续 Validation 编译消费。

#### Scenario: 从 structural keyword 推导 Object
- **GIVEN** Schema 缺失 `type` 但包含 `properties`
- **WHEN** 分析有效结构
- **THEN** 产生 Object shape，并返回带原始 `SchemaPath` 的非阻断 inference Diagnostic

#### Scenario: 区分 list、tuple 与 nullable scalar
- **GIVEN** 三个 Schema 分别使用 `items`、`prefixItems` 和 `type: ["string", "null"]`
- **WHEN** 分析 shape
- **THEN** 分别得到 list Array、tuple Array 和 nullable string Scalar 结构，而不把数组 index 当作运行时身份

#### Scenario: enum 和 format 仅影响后续消费
- **GIVEN** string Schema 同时声明 `enum` 与 `format`
- **WHEN** 分析 shape
- **THEN** shape 仍为 string Scalar，且 enum/format 来源可供后续 Widget resolution 使用

### Requirement: 合法但不可可靠生成的 Schema 显式报告能力边界
对于 meta-valid 但超出首期自动结构/UI 生成能力的 Schema，编译器必须（MUST）产生稳定的 unsupported 或 partially-supported Diagnostic。只有仍能产生语义安全静态模型时该问题才可（MAY）非阻断；否则必须（MUST）失败，不得静默选择看似合理的结构或 Widget。

#### Scenario: 保守处理无法确定的结构组合
- **GIVEN** 合法 applicator 组合无法形成无歧义的静态结构表示
- **WHEN** Shape Analyzer 尝试推导
- **THEN** 返回可定位的能力 Diagnostic，并且不会丢弃冲突分支或任意选择其中之一

#### Scenario: 保留有限 conditional 的候选结构
- **GIVEN** `if/then/else` 或 `dependentSchemas` 引入有限数量的候选 properties
- **WHEN** 分析静态 shape
- **THEN** 所有候选位置进入 static superset，并保留分支来源供后续 Schema Dynamics 编译，当前阶段不计算 Runtime `active`

