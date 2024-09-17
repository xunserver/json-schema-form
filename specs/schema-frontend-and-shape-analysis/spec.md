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

### Requirement: 非 canonical dialect 通过冻结 Registry 的 Dialect Adapter 转换
当根 Schema 声明非 Draft 2020-12 的 `$schema` 时，Schema Frontend 必须（SHALL）在冻结 `FormEnvironment` 的 `schemaDialects` Registry 中查找声明该 URI 的唯一 adapter：命中时以 readonly 输入调用其同步 `convert()`，把返回的 Draft 2020-12 Schema 作为后续 meta-validation、reference resolution 与 shape 分析的输入，并在 model diagnostics 中记录 dialect provenance（原 URI、adapter name、Plugin ID）；adapter 返回的 warning 以 `source: "schema"` 并附 `pluginId` 进入 `CompileResult.diagnostics`。未命中时必须（MUST）保留既有 `schema.invalid-dialect` 阻断；adapter throw、返回 thenable、返回非 JSON 或仍声明非 canonical dialect 的结果必须（MUST）以阻断 `CompileError` 报告，且不泄漏原始异常或 partial model。转换不得（MUST NOT）修改调用者的 Definition 对象，也不得访问 global state。子 Schema 内嵌的其他 dialect `$schema` 必须（MUST）产生 unsupported diagnostic 而不是静默按 canonical 解释。

#### Scenario: 通过 adapter 编译 draft-07 Schema
- **GIVEN** Environment 安装了声明 `http://json-schema.org/draft-07/schema#` 的 dialect adapter，Definition 根 Schema 声明该 URI
- **WHEN** 调用 `compileForm(definition, { environment })`
- **THEN** adapter 输出按 Draft 2020-12 完成编译，`model` 存在，diagnostics 含 dialect provenance，输入 Definition 未被修改

#### Scenario: 无 adapter 时保持阻断
- **GIVEN** 默认 Environment 没有任何 dialect adapter，根 Schema 声明 draft-07
- **WHEN** 执行编译
- **THEN** 抛出带 `schema.invalid-dialect` 与 dialect URI 的 `CompileError`，行为与不存在 Registry 时一致

#### Scenario: adapter 失败不产生 partial model
- **GIVEN** 命中的 adapter 在 `convert()` 中 throw，或返回仍带 draft-07 `$schema` 的结果
- **WHEN** 执行编译
- **THEN** 以稳定 code、`SchemaPath` `#`、adapter name 与 Plugin ID 的 `CompileError` 失败，diagnostic message 不包含原始异常对象或 stack

#### Scenario: 相同输入重复转换结果等价
- **GIVEN** 同一 Definition 与同一 Environment
- **WHEN** 连续两次编译
- **THEN** 两次 `CompiledFormModel` 的结构、ID、diagnostics 顺序与 provenance 语义相同，adapter 每次都只接收 readonly 输入

### Requirement: 已声明的 x-* keyword 在编译前拆分为标准输入
Schema Frontend 必须（SHALL）在 normalization 阶段识别冻结 `schemaExtensions` Registry 中已声明的 `x-*` keyword，并记录只读 occurrence。`split()` 必须（MUST）在 DataModel 实例化之后、进入 UI/Rule/Config/Dynamics/Validation compiler 之前调用，以便传入该位置实例化后的 `ModelPath`；把返回的 `FieldUI`、Rule Definition 与 Form Config 片段合并进本次编译的 UI Schema、Rules 与 Form Config 输入，并从 canonical Schema 中移除该 keyword 且记录 derived provenance。显式 `uiSchema.fields[modelPath]`、`rules` 与 `config` 必须（MUST）保持 authoritative：与片段重叠的键以 warning diagnostic 报告并忽略片段值。合并后的片段必须（MUST）经过与手写输入相同的 UI/Rule/Config 校验与 diagnostics。位于无法映射到 `ModelPath` 的 Schema 位置（例如 `if` 谓词、`$defs` 未被引用的节点）的已声明 keyword 必须（MUST）产生 unsupported diagnostic 而不被应用；未声明的 `x-*` 必须（MUST）继续按既有 warning 处理且不进入任何内部协议；`split()` throw、返回 thenable 或非法片段形状必须（MUST）以阻断 `CompileError` 报告。

#### Scenario: x-ui 拆分为 FieldUI
- **GIVEN** Environment 安装了声明 `x-ui` 的 extension，其 `split()` 把 `{ widget: "textarea", label: "Bio" }` 映射为 `FieldUI` 片段；Schema 在 `#/properties/bio` 上声明该 keyword 且 `uiSchema` 未配置 `bio`
- **WHEN** 编译
- **THEN** `model.ui.fields.get("bio")` 解析为 `textarea` Widget 并带 label，canonical Schema 中不再含 `x-ui`，diagnostics 记录该 Field 的 derived provenance

#### Scenario: 显式 UI Schema 覆盖扩展片段
- **GIVEN** 同一位置的 `x-ui` 片段声明 `widget: "textarea"`，而 `uiSchema.fields.bio.widget` 显式为 `text`
- **WHEN** 编译
- **THEN** 最终 Widget 为 `text`，产生说明重叠键、`ModelPath` 与 extension name 的 warning，且 `model` 正常发布

#### Scenario: 数组模板位置按 ModelPath 拆分
- **GIVEN** `x-ui` 出现在 `#/properties/products/items/properties/name`
- **WHEN** 编译
- **THEN** 片段应用到 `ModelPath` `products[].name`，不产生任何 `products[0]` 形式的 InstancePath，也不修改 DataModel 结构

#### Scenario: 不可映射位置产生 unsupported diagnostic
- **GIVEN** 已声明的 `x-ui` 出现在 `if` 谓词子 Schema 内
- **WHEN** 编译
- **THEN** 产生带 `SchemaPath` 的 unsupported diagnostic，该片段不被应用，编译是否阻断遵循该 diagnostic 的 severity 且不猜测目标 Field

#### Scenario: 未声明 x-* 仍只警告
- **GIVEN** Schema 含 Environment 未声明的 `x-legacy`
- **WHEN** 编译
- **THEN** 行为与本能力引入前一致：产生既有 warning、keyword 不进入 UIModel/RuleModel/Config，也不阻断编译

#### Scenario: split 失败阻断编译
- **GIVEN** extension 的 `split()` throw 或返回带 function 成员的片段
- **WHEN** 编译
- **THEN** 抛出带 `SchemaPath`、extension name 与 Plugin ID 的 `CompileError`，不发布 partial model，不泄漏原始异常

#### Scenario: DataModel 后 split 获得 ModelPath
- **GIVEN** Environment 安装了声明 `x-ui` 的 extension，其 `split()` 需要 `ModelPath`
- **WHEN** 编译含该 keyword 的 Schema
- **THEN** Frontend 只记录 occurrence；DataModel 完成后调用 `split()`，合并片段并从 canonical Schema 移除 keyword

