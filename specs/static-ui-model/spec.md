# static-ui-model Specification

## Purpose

定义框架无关且完全 resolved 的静态 UIModel，将 Data Tree 的交互投影与具体呈现树分开，并在 Renderer 运行前确定 Field、逻辑 Widget、UI Schema 引用和布局语义。

## Requirements

### Requirement: Field Registry 是 Data Tree 的独立交互投影
UIModel 必须（SHALL）按 `ModelPath` 提供独立于 DataNode 和 ViewNode 的只读 Field Registry。Scalar 默认生成 Field；Object/Array 默认保持 container，只有显式配置兼容的 atomic Widget 时才生成 Field。`field: false` 必须（MUST）在 compile time 禁止生成该 Field；`visible: false` 必须（MUST）保留 Field 与 View 引用，仅作为后续 effective visible 状态的输入。

#### Scenario: 默认投影 scalar 与 container
- **GIVEN** Object Schema 包含 scalar child 与 nested Object/Array
- **WHEN** 编译 UIModel 且没有对应 FieldUI 覆盖
- **THEN** scalar 出现在 Field Registry，Object/Array 只作为 container 且不自动成为 Field

#### Scenario: field false 与 visible false 不等价
- **GIVEN** `hiddenByDefinition` 配置 `field: false`，`temporarilyHidden` 配置 `behavior.visible: false`
- **WHEN** 编译 UIModel
- **THEN** 前者没有 FieldDescriptor，后者仍有 FieldDescriptor 和可解析 View，只保留 visible policy 而不计算 Runtime state

#### Scenario: Object 使用 atomic Widget
- **GIVEN** Object path 显式指定一个 value contract 与 Object shape 兼容的已注册 Widget
- **WHEN** 编译 Field Registry 与默认 ViewTree
- **THEN** 该 path 成为 atomic Field，默认 View 不再展开其 child fields

### Requirement: FieldDescriptor 提供可追溯的 required presentation source
凡 Field 由 Object property edge 对应的 DataNode 投影而来，Compiler 必须（MUST）在 `FieldDescriptor` 中发布只读 requirement presentation source，包含 owning Object `ModelPath`、property name、`required | optional | conditional` 状态及原始 `SchemaPath` 来源；required 仍必须（MUST）归属于 Object edge，不得成为 DataNode intrinsic state。静态 required/optional 必须（MUST）直接忠实投影 edge；conditional 记录必须（MUST）稳定关联对应 `SchemaDynamics` activation source，但不得（MUST NOT）在 UIModel 中猜测当前实例的 effective required。根 Field 或 Array item 等不存在 Object property edge 的位置不得（MUST NOT）伪造 required 来源。

#### Scenario: 投影静态 required 与 optional 来源
- **GIVEN** Object Schema 的 `name` property 静态 required、`nickname` property 静态 optional，且二者都生成 Field
- **WHEN** 编译 UIModel
- **THEN** 两个 FieldDescriptor 分别包含 required 与 optional 的冻结 presentation source，并可追溯到同一 owning Object edge 及各自 Schema 来源

#### Scenario: conditional required 只记录 Dynamics 来源
- **GIVEN** conditional Schema 只在某个 branch active 时要求 `companyName`，且该位置进入 static superset
- **WHEN** Compiler 装配 DataModel、SchemaDynamics source 与 UIModel
- **THEN** `companyName` FieldDescriptor 标记为 conditional 并稳定关联对应 activation/Schema 来源，但不包含实例级当前 required boolean；后续 Dynamics/effective snapshot owner负责求值

#### Scenario: 非 property Field 不伪造 required
- **GIVEN** 根 Scalar 或 Array item template 直接投影为 Field，且没有 incoming Object property edge
- **WHEN** 编译 UIModel
- **THEN** FieldDescriptor 不宣称来自 JSON Schema `required` 的 presentation source，Renderer 也无需把缺失来源解释为 required

#### Scenario: UI 与 Validation 不能覆盖 required 真相
- **GIVEN** `FieldUI.props`、任一 `native` namespace 或 Validation error metadata 尝试声明 required 值
- **WHEN** Compiler 产生 FieldDescriptor 与 required presentation source
- **THEN** requirement 仍只来自 Object property edge/SchemaDynamics provenance；`required` 不成为 `FieldUI` 标准成员，保留键或非法覆盖按既有结构化 Diagnostic 处理

### Requirement: Widget resolution 使用冻结 Registry 的确定优先级
每个 Field 必须（MUST）解析出已注册且与 Data shape/value contract 兼容的逻辑 Widget。解析顺序必须（MUST）为显式 widget、enum/const matcher、format matcher、type/shape matcher、fallback；同一类别按 matcher priority 和稳定 Registry 顺序确定。显式 Widget 不存在、无安全匹配或 value/props/capability 不兼容时必须（MUST）产生结构化 Diagnostic，阻断无法形成合法 FieldDescriptor 的编译。

#### Scenario: 显式 Widget 胜过 matcher
- **GIVEN** string enum 同时可匹配 `select`，但 FieldUI 显式指定已注册 `text`
- **WHEN** 解析 Widget
- **THEN** FieldDescriptor 使用 `text`，并仍保留 enum Schema 来源供后续 validation 使用

#### Scenario: matcher 类别与优先级确定选择
- **GIVEN** 多个 Widget 分别匹配 enum、format 和 string shape
- **WHEN** 重复编译同一输入
- **THEN** 先按类别再按显式 priority 与 Registry 顺序选择相同 Widget，不依赖对象遍历偶然性

#### Scenario: 报告缺失或不兼容 Widget
- **GIVEN** FieldUI 指定未注册 Widget，或 Object path 指定仅接受 scalar value 的 Widget
- **WHEN** 编译 UIModel
- **THEN** 抛出的 `CompileError` 包含 Widget key、`ModelPath` 与稳定 error code，且不发布 partial Field Registry

### Requirement: UI Schema fields 与 native 边界在编译期校验
`UISchema.fields` 与 layout 中的 Path 必须（MUST）是合法 canonical `ModelPathLike` 并解析到对应 DataNode 或 Field；错误 Path 必须（MUST）阻断编译。`native` 必须（MUST）按非空 Adapter ID 隔离并作为只读 opaque options 保存，不得（MUST NOT）覆盖 `value`、`disabled`、`readonly`、`errors` 等 Core 保留属性，或携带可变 Runtime 内部对象。

#### Scenario: 拒绝不存在的 Field Path
- **GIVEN** UI Schema fields 引用 `products[].missing`
- **WHEN** DataModel 不包含该位置并执行 UI 编译
- **THEN** 产生带该 `ModelPath` 的阻断 Diagnostic，而不是创建脱离 Data Tree 的 Field

#### Scenario: 按 Adapter ID 保留 native options
- **GIVEN** 一个 Field 分别声明 `element-plus` 与 `mui` 的非保留 native options
- **WHEN** 编译 UIModel
- **THEN** 两个 options namespace 独立且运行时不可修改，Core 不解释其 UI library 语义

#### Scenario: 拒绝 native 覆盖核心状态
- **GIVEN** 任一 Adapter namespace 在 native options 中声明 `value` 或 `errors`
- **WHEN** 编译 UIModel
- **THEN** 编译以带 Field `ModelPath`、Adapter ID 和保留 key 的 Diagnostic 失败

### Requirement: 缺省 layout 生成保留数据结构的 ViewTree
当 UI Schema 没有显式 layout 时，Compiler 必须（SHALL）按 Data Tree 与有效 property 顺序生成完全 resolved 的默认 ViewTree。默认 ViewTree 必须（MUST）保留 Object/Array container 层级、为每个可呈现 Field 建立独立 FieldView，并在 Object/Array atomic Field 或 `field: false` 处遵循 Field 生成结果。

#### Scenario: 生成嵌套默认 ViewTree
- **GIVEN** 一个包含 nested Object、Array item template 与 scalar leaves 的 DataModel
- **WHEN** 未提供 layout 并编译 UIModel
- **THEN** ViewTree 保留 Object/Array 层级与声明顺序，所有引用在 Renderer 之前已经解析

#### Scenario: atomic container 不展开默认 children
- **GIVEN** Array path 被显式配置为 atomic Field
- **WHEN** 生成默认 ViewTree
- **THEN** 该位置生成 FieldView，且不会同时生成重复的 item child views

### Requirement: 显式 layout authoritative 且在编译期完全解析
存在显式 layout 时，该 layout 必须（MUST）决定最终呈现结构，未引用 Field 默认不得（MUST NOT）自动追加。Compiler 必须（MUST）解析 Field/Object/Array 与纯 presentation container 的不同语义，在作用域内展开 `remaining-fields` 并从最终 ViewTree 移除该 DSL；同一 Field 可以（MAY）由多个具有不同 `ViewNodeId` 的 FieldView 引用。

#### Scenario: 未引用字段默认不渲染
- **GIVEN** Field Registry 包含 `first` 与 `second`，显式 layout 只引用 `first`
- **WHEN** 编译 ViewTree
- **THEN** 最终树只包含 `first` 的 FieldView，且不会隐式追加 `second`

#### Scenario: remaining-fields 显式补齐
- **GIVEN** 显式 layout 先引用一个 Field，随后在同一 Object scope 使用 `remaining-fields`
- **WHEN** 编译 ViewTree
- **THEN** 其余可呈现 Field 按确定顺序展开，最终树中不存在 `remaining-fields` 节点

#### Scenario: 同一 Field 多次呈现
- **GIVEN** 显式 layout 在两个 presentation group 中引用同一 Field
- **WHEN** 编译 ViewTree
- **THEN** 两个 FieldView 拥有不同 `ViewNodeId`，但都引用同一个 FieldDescriptor/`ModelPath`

### Requirement: DataNode、FieldDescriptor 与 ViewNode 不合并
最终 UIModel 必须（MUST）保持 Data Tree、Field Registry 与 ViewTree 三种所有权边界；`ObjectView` 不得（MUST NOT）等同于纯 presentation `GroupView`，`ArrayView` 不得（MUST NOT）等同于 item repetition layout。Renderer 所需的 Field 引用、scope 与 layout 参数必须（MUST）在 compile 后 resolved，但不得包含 Framework component、DOM event、Adapter binding 或 Runtime effective snapshot。

#### Scenario: 区分数据 container 与展示 group
- **GIVEN** 显式 layout 同时包含绑定 Object path 的 container 和不绑定数据的 group
- **WHEN** 下游检查 resolved ViewTree
- **THEN** 两者具有不同 View kind 和语义，且不需要 Renderer 重新查询 Schema 判断

#### Scenario: ViewTree 不泄漏 Render-time state
- **GIVEN** 一个包含重复 FieldView、visible policy 与 native options 的编译结果
- **WHEN** 检查 ViewNode 契约
- **THEN** ViewNode 只包含静态引用和布局信息，不包含 focused、collapsed、active tab、framework key 或当前 effective visible state
