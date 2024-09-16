# JSON Schema Form 架构设计

> 状态：架构基线（已决策）  
> 适用范围：首个可用版本及其后续兼容演进  
> Canonical JSON Schema Dialect：Draft 2020-12

## 1. 文档目的

本文档固化 JSON Schema Form Engine 的整体架构、职责边界、核心模型、运行时语义、扩展机制、公共 API、npm 包边界和目录约定。后续实现应以本文档为基线；如果实现需要突破其中的“架构不变量”，必须先形成新的架构决策并更新本文档。

本文中的 `@form/*` 是逻辑包名。正式发布前可以替换 npm scope，但包的职责边界不随命名改变。

## 2. 目标与非目标

### 2.1 目标

- 使用 JSON Schema 描述数据结构、约束和数据语义。
- 使用独立 UI Schema 描述逻辑 Widget、展示、交互和布局。
- 同一份 Form Definition 同时支持 Vue、React 及不同 UI 组件库。
- Core 可运行在 Browser、Node.js、SSR、Web Worker 和测试环境。
- 编译阶段尽可能发现错误，并产出稳定、可检查的只读模型。
- Runtime 具备事务化更新、精确订阅、规则联动、同步/异步校验和稳定数组身份。
- 通过受控 Registry/Provider 扩展能力，而不是允许插件任意篡改核心流程。
- 简单业务使用短路径 API，高级项目可显式构建可复用 Engine 和 Environment。

### 2.2 非目标

- Core 不直接渲染 Vue、React 或任何 DOM。
- Core 不绑定 Element Plus、Ant Design、MUI 或其他 UI 库。
- Core 不绑定 AJV；AJV 只是一个 Validator Adapter 实现。
- 不承诺所有合法 JSON Schema 都能自动生成理想表单。
- 不创建跨 Vue/React 的通用 Renderer 或自定义 VDOM。
- 不把 UI 组件库的 Form Store、Validation 或状态模型作为系统真相。
- 首期不提供任意生命周期 Hook、异步规则执行器或运行时重新编译。

## 3. 架构不变量

以下规则是实现必须保持的硬边界：

1. `JSON Schema = Data Contract`，`UI Schema = Presentation Contract`，`FormConfig = Form-level Runtime Configuration`。
2. 生命周期固定为 `Definition -> compile -> Compiled Model -> instantiate -> Runtime`。
3. `CompiledFormModel` 是不可变模板；所有实例状态只存在于 `FormInstance`。
4. `Data Tree`、`Field Registry`、`View Tree` 不合并成万能 FormNode Tree。
5. Path 表示“在哪里”，ID 表示“是谁”；数组 index 永远不是身份。
6. 嵌套业务对象是 Values 的唯一数据源；Field State 不复制 value。
7. 所有 mutation 必须经过 Runtime Command/Transaction，不能直接修改公开 values。
8. Renderer 只消费已解析的 ViewTree 和 Effective Snapshot，不解释 Schema、Rule 或 Validation 来源。
9. Core 对 Vue、React、DOM、UI 库和 AJV 保持零依赖。
10. Core Plugin 必须框架无关；UI Adapter 属于 Render-time Extension。
11. Extension 通过注册能力实现；不得绕过 TransactionManager 或修改 Compiled Model。
12. Schema 的 `active` 与 UI 的 `visible` 是不同语义。

## 4. 总体分层

```text
Form Definition
  |- JSON Schema
  |- UI Schema
  |- Rule Definitions
  `- Form Config
          |
          v
Schema Frontend / Compiler
          |
          v
CompiledFormModel (readonly)
  |- DataModel
  |- UIModel
  |- RuleModel
  |- ValidationModel
  |- SchemaDynamics
  `- Diagnostics
          |
          v
FormInstance
  |- ValueStore
  |- Field / View State Stores
  |- ArrayStateStore
  |- FormRuntime.dispatch (transaction phases)
  |- DependencyScheduler (internal)
  |- RuleDynamicsEngine
  |- ValidationEngine
  `- Selectors / Subscriptions
          |
          +-----------------------+
          v                       v
     Vue Renderer            React Renderer
          |                       |
          v                       v
   Vue UI Adapter           React UI Adapter
          |                       |
          v                       v
 Element Plus / ...          MUI / ...
```

依赖只能沿上述方向流动。特别禁止 `model -> runtime`、`widget -> compiler`、`core -> framework` 和 `core -> concrete validator`。

## 5. Definition Layer

### 5.1 FormDefinition

```ts
interface FormDefinition {
  schema: JsonSchema
  uiSchema?: UISchema
  rules?: RuleDefinition[]
  config?: FormConfig
}
```

`defineForm()` 是无副作用的 authoring helper，只负责类型推导、输入规范化和 IDE 体验；它不编译、不创建 Runtime，也不注册全局状态。

可选的 `x-*` 扩展只是一种输入语法糖。Schema Frontend 必须识别已声明的 `x-*` occurrence；`split()` 在 DataModel 实例化之后应用，以便传入 `ModelPath`，再合并进 UI Schema、Rules 和 Form Config。内部模型不以 `x-*` 为核心协议。

### 5.2 JSON Schema 职责

JSON Schema 负责：

- 数据结构和类型；
- required、minimum、minLength 等数据约束；
- title、description、default、format 等标准语义或 annotation；
- oneOf、anyOf、allOf、if/then/else、dependentSchemas 等 Schema 语义。

JSON Schema 不包含 Vue/React 组件、UI 库 props、页面布局和运行时状态。

### 5.3 UI Schema 职责

UI Schema 使用“字段 Path Map + Layout Tree”双结构：

```ts
interface UISchema {
  fields?: Record<ModelPathLike, FieldUI>
  layout?: LayoutNode
}

interface FieldUI {
  field?: boolean
  widget?: WidgetName
  display?: FieldDisplay
  props?: WidgetProps
  behavior?: FieldBehavior
  native?: Record<AdapterId, NativeFieldOptions>
}
```

- `fields` 使用 ModelPath 索引，负责字段级表现和交互。
- `layout` 使用树结构，负责页面组织。
- `display` 负责 label、help、tooltip、label mode 等展示信息。
- `props` 只放逻辑 Widget 的标准能力。
- `behavior` 负责 visible、disabled、readonly 等 Form Engine 状态策略。
- `native` 是按 Adapter ID 隔离的 escape hatch，只承载 UI 库独有能力。

`native` 不得覆盖 value、disabled、readonly、errors 等核心保留属性，也不得直接绑定 Runtime 内部对象。跨多个 UI 库都存在的常用能力应升级为标准 Widget props，而不是长期留在 `native`。

Validation、required 和 layout 不进入 `FieldUI`。

## 6. Path 与 Identity

系统保留三套 Path：

| 类型 | 示例 | 用途 |
|---|---|---|
| `SchemaPath` | `#/properties/products/items/properties/name` | Schema Frontend、诊断和调试 |
| `ModelPath` | `products[].name` | Compiled Model、UI Schema、Rules |
| `InstancePath` | `products[2].name` | Runtime 命令和查询 |

业务 Public API 主要接触 `ModelPath` 和 `InstancePath`；`SchemaPath` 属于高级检查信息。

身份类型包括：

- `DataNodeId`：Compiled DataNode 身份；
- `ViewNodeId`：Compiled ViewNode 身份；
- `ArrayItemId`：数组项的稳定 Runtime 身份；
- `RuntimeNodeId`：由 DataNodeId 与 ArrayItemId chain 等实例绑定信息形成。

`InstancePath` 是当前地址，会因数组 move/remove 改变；`RuntimeNodeId` 保持稳定。Public API 可暴露 `ArrayItemId`，但不暴露内部 `RuntimeNodeId`。

Public API 可以接受字符串形式的 `ModelPathLike` / `InstancePathLike`，内部使用 branded type，避免第一版为了类型极致牺牲易用性。

## 7. Compiler

### 7.1 Compiler Pipeline

```text
Raw Form Definition
        |
        v
Schema Frontend
  dialect detection / meta validation / reference resolution
  recognize declared x-* occurrences
        |
        v
Canonical Schema Graph
        |
        v
Shape Analyzer
        |
        v
Effective Data Shape
        |
        v
Data Model Compiler
        |
        v
DataModel
        |
        v
Declared x-* Extension Apply (split + merge authoring)
        |
        +-------- UI Compiler --------> UIModel
        +-------- Rule Compiler ------> RuleModel
        +-------- Validation Compiler -> ValidationModel
        `-------- Dynamics Compiler --> SchemaDynamics
                         |
                         v
              CompiledFormModel + Diagnostics
```

`compileForm()` 具有纯函数语义：相同 Definition 和 Environment 应产生语义相同的结果；可复用共享默认 Environment 与 model provenance 记录，但不创建业务可变全局 Registry。

```ts
interface CompileResult {
  model: CompiledFormModel
  diagnostics: readonly Diagnostic[]
}
```

无法产生合法模型的错误（例如 Schema 无法解析、UI 引用不存在的 ModelPath、必需插件或 Widget 缺失）抛出结构化 `CompileError`；能够产生模型的 warning、inference warning 和 deprecated syntax 等问题进入 `diagnostics`，不阻断产物。普通调用者不需要处理 `model` 缺失的分支。

### 7.2 Schema Frontend

首个 canonical dialect 为 Draft 2020-12。其他 dialect 通过 `SchemaDialectAdapter` 转换。

Normalization 只消除语法和 dialect 差异，不消除语义复杂性：

- `$ref` 保留引用图关系，不盲目 inline；
- `allOf`、`oneOf`、`anyOf`、conditional applicator 不暴力拍平；
- boolean schema、annotations 和 assertions 保留原义；
- 可以生成 derived metadata，但必须记录来源，不能伪装成原始 Schema 语义。

“Validation 能支持”与“自动表单生成能支持”是两种 capability。无法可靠推导 UI 的合法 Schema 应产生明确 diagnostic，而不是猜测。

### 7.3 Shape Analyzer

Shape Analyzer 从约束语言推导 Form Engine 可消费的结构，不执行 validation，也不包含 UI 信息。

首期 Shape 类型：

```text
DataShape
  |- ScalarShape: string / number / integer / boolean
  |- ObjectShape
  |- ArrayShape: list / tuple
  |- UnionShape
  |- AnyShape
  |- NeverShape
  `- NullShape (仅纯 null 场景；通常以 nullable 修饰表达)
```

关键规则：

- 缺失 `type` 时可以根据 structural keywords 推导 shape，但标记为 inferred。
- `allOf` 只组合结构信息，不等价于 JSON Schema 全量 merge。
- required 属于 Object property edge，不是 child node 的 intrinsic property。
- `enum`、`const`、`format` 不改变 Shape；它们供后续 Widget inference 和 validation 使用。
- 有限 conditional structure 形成 Static Superset 和 activation metadata。

### 7.4 DataModel

Schema Graph 可以共享引用节点；Data Tree 必须按结构位置实例化。

```ts
interface DataModel {
  readonly root: DataNode
  readonly nodes: ReadonlyMap<ModelPath, DataNode>
}
```

DataNode 主要分为 Object、Array、Scalar、Union 和 RecursiveRef。每个节点保留稳定 `DataNodeId`、`ModelPath`、`schemaRef` 和必要结构元数据，但不复制所有 Schema keyword。

数组 item template 自身拥有合法 ModelPath，例如 `products[]`。递归 Schema 使用 `RecursiveDataRef` 截断编译期无限展开，实际实例在 Runtime 按需创建。

### 7.5 UIModel

```ts
interface UIModel {
  readonly fields: ReadonlyMap<ModelPath, FieldDescriptor>
  readonly viewTree: ViewNode
}
```

`DataNode` 描述数据；`FieldDescriptor` 是 DataNode 的交互投影；`ViewNode` 描述一次具体呈现。三者不是继承关系。

Field 生成规则：

- Scalar 默认生成 FieldDescriptor。
- Object/Array 默认作为 container，不生成 FieldDescriptor。
- UI Schema 显式指定 `widget` **或** `field: true` 时，Object/Array 也可成为 atomic Field。
- `field: false` 在 compile time 禁止该 DataNode 生成 Field。
- `visible: false` 只表示运行时/展示状态，不能代替 `field: false`。

Widget resolution 顺序为：显式 widget > enum/const matcher > format matcher > type/shape matcher > fallback。匹配由优先级明确的 Registry 完成，不硬编码为巨大 if/else。

ViewTree 规则：

- 没有显式 layout 时，按 Data Tree 和 properties 顺序生成默认 ViewTree，并保留 Object/Array 结构层级。
- 存在显式 layout 时，layout 是 authoritative；未引用字段默认不渲染。
- `remaining-fields` 是显式补齐 DSL，在 compile time 展开，不进入最终 ViewTree。
- 同一个 Field 可以被多个拥有独立 ViewNodeId 的 FieldView 引用，并共享同一 Field Runtime State。
- `ObjectView != GroupView`，`ArrayView != RepeatLayout`。
- Object/Array 被 atomic Widget 化后，默认不再展开 child views。
- ViewTree 在 compile 后完全 resolved；Renderer 不再检查 Field 引用或补默认布局。
- Layout 使用框架无关语义，首选 CSS Grid 风格的 columns/span，而不绑定某个组件库的固定栅格。

## 8. Runtime

### 8.1 Runtime 存储

```text
FormInstance
  |- ValueStore
  |    |- nested values (single source of truth)
  |    `- initial snapshot
  |- FieldStateStore
  |    `- touched
  |- ViewStateStore
  |    |- focused
  |    |- collapsed
  |    `- active tab
  |- ArrayStateStore
  |    `- stable ArrayItemId order
  |- RuleDynamicsEngine
  |    |- schemaActive / rule-owned aspects
  |    `- computed target tracking
  |- ValidationEngine
  |    |- direct errors / validating
  |    `- submitting / submitCount
  |- FormStateStore
  |    `- version
  `- Selectors / Subscription
```

Values 保持正常嵌套业务结构，也是 JSON Schema 所描述的 instance。对外只提供 readonly snapshot/view；写入必须使用 `setValue`、`setValues`、array commands 等命令。`NodeStateStore` 可作为内部占位保留，但不作为 errors/validating 的权威存储。

### 8.2 Source State 与 Derived State

| 状态 | 类型 | 归属 |
|---|---|---|
| value | Source | ValueStore |
| direct errors / validating | Source | ValidationEngine |
| touched | Source | FieldState |
| focused / collapsed / activeTab | Source | ViewState |
| submitting / submitCount | Source | ValidationEngine |
| dirty / valid | Derived | Node、Field、Form selector |
| effective active / visible / disabled / readonly | Derived | RuleDynamicsEngine + Selector |

Object、Array 和 Form 的 dirty、touched、valid 主要由自身结构变化和 descendants 聚合，不复制一套容易失真的状态。Renderer 只能读取 readonly Effective Snapshot；所有修改通过 command 完成。

`focused` 属于具体 View，因为同一 Field 可出现多次；`touched` 属于 Field，因为它表达业务字段是否交互过。

### 8.3 Transaction Pipeline

一次 public mutation 是一个 transaction：

```text
Mutation API
    -> FormRuntime.dispatch
    -> Value / Array Mutation
    -> Change Queue
    -> Schema Activation
    -> DependencyScheduler (value changes + activation flips)
    -> State/Computed Rules + declarative Value Effects
    -> repeat until stable
    -> Sync Validation
    -> Commit + runtime.version++
    -> Publish stable snapshots
    -> Schedule Async Validation
```

核心语义：

- 公共 mutation 经 `FormRuntime.dispatch` 进入事务；`TransactionManager` 与 `DependencyScheduler` 是内部实现，不进入公开 API。
- `setValues()` 和多字段操作在一个 batch 中完成。
- Rule 产生的新 mutation 加入当前 change queue，不递归开启无边界 transaction。
- Schema activation `false→true` 翻转必须通过 DependencyScheduler 重新调度受影响 Rule 与 Validation plan。
- no-op mutation 不进入后续流水线。
- computed value graph 必须是 DAG；Runtime 同时设置迭代/命令上限防止 effect 不收敛。
- Subscriber 只观察 commit 后的稳定状态；subscriber 异常不能回滚已完成 commit。
- Core 提供 selector-based external store，不实现 RxJS，也不依赖 Vue watch/React state。
- 框架绑定在叶节点附近订阅，避免一个字段变化导致整表重渲染。

事务的失败回滚细节保留为实现决策，但对外必须表现为原子命令：不得发布半完成状态。

## 9. Rule 与 Dependency Engine

Rule Definition 的主路径是可序列化 AST，JavaScript function 只能通过 Runtime Registry 按名称调用。

```ts
{ eq: [{ field: 'country' }, 'CN'] }
{ call: 'company.isTaxIdRequired', args: [...] }
```

Rule 分为：

| 类型 | 修改 value | 结果 |
|---|---:|---|
| State Rule | 否 | active/visible/disabled/readonly 等状态 |
| Computed Rule | 是 | 计算值，默认 readonly |
| Validation Rule | 否 | ValidationError |
| Effect Rule | 受限 | 少量声明式 command |

Compiler 静态提取 dependencies，构建 `ModelPath -> RuleId[]` 索引，校验 target、function reference 和 cycle。数组 item rule 使用相对 ModelPath 语义，由 Runtime 的 instance binding 解析到同一 item scope。

Runtime 中 Schema Dynamics、Rule Engine 和 Validation 共享内部 DependencyScheduler 与事务设施，但三者保留独立语义模型。DependencyScheduler 根据 value/field change set、activation 翻转与 `forceAll`/`reset` 计算本轮 Rule instance 与 Validation plan binding，不对外导出。首期规则同步、纯且可预测；远程 options、async data source 等后续通过专用 Resolver Registry 扩展，不让 Rule Engine 直接 fetch。

## 10. Validation

Core 定义统一 Validation Protocol，但不依赖具体 validator。

所有来源归一为结构化 `ValidationError`：

```ts
interface ValidationError {
  id: string
  code: string
  source: 'schema' | 'custom' | 'async' | 'server'
  instancePath: InstancePath
  modelPath?: ModelPath
  message?: string
  keyword?: string
  params?: unknown
  validatorId?: string
  schemaPath?: SchemaPath
}
```

错误挂在任意 Runtime DataNode，而不是 FieldView。Node 的 `directErrors` 与 descendant aggregation 分离，避免父节点复制所有 child errors。

### 10.1 Schema Validator Adapter

Adapter 负责把 validator-specific semantics 转成 Form Engine semantics，包括 path、error code、required target 和 params normalization。例如对象上的 `required` 错误应归一到缺失属性的 InstancePath，同时保留原始 schemaPath/params 供调试。

首期 Schema validation 保证 `validateAll`。`validateAt` / `validateAffected` 只能作为 Adapter 声明的可选安全优化；Core 不假设 JSON Schema 可简单做字段级增量校验。

### 10.2 Custom、Async 与 Server Error

- Custom Validator 声明 target 和 dependencies，通过 Registry 名称引用。
- 同步 validation 参与当前 transaction。
- Async validation 不阻塞 transaction，使用独立 state transaction 更新结果。
- Async 采用 latest-wins；支持 AbortSignal 时主动取消，但正确性不依赖 abort。
- Server errors 通过 `applyErrors()` 注入，不伪装成 validator；字段 value 变化后默认清除该字段的 server error。

Validation semantics、trigger policy 和 error presentation 严格分离。`change`、`blur`、`submit`、`manual` 属于 ValidationScheduler；错误是否展示由 touched、submitCount 和 view policy 决定。

hidden、disabled、readonly 默认不改变 JSON Schema validation 语义。Schema-inactive subtree 则不参与当前 effective validation；两者不能混用。

## 11. Dynamic Structure

有限结构变化采用 `Static Superset + Runtime Activation`：

- oneOf/anyOf/if-then-else/dependentSchemas 的可能节点在 compile time 建模；
- Runtime 只切换 branch/node activation，不重新 compile 或修改 DataModel；
- `active != visible`：active 属于 Schema/data semantics，visible 属于 presentation；
- inactive node 仍可寻址，允许 programmatic mutation，便于 draft 恢复和预填充；
- inactive branch values 默认保留；Serializer 决定是否 prune；
- inactive subtree 不参与当前 effective validation 和相关 rule execution；
- branch 切换不重建 Field/View state。

无限或实例数量变化只发生在 Array 和 recursive schema。Runtime 实例始终引用既有 ModelNode/template，不向 `CompiledFormModel.nodes` 动态添加节点。

## 12. Array、Object 与 Scope

数组 index 只是当前地址，`ArrayItemId` 才是身份。身份作为 sidecar state 保存，不污染业务 values。

Array mutation 是一等命令：

```text
append / insert / remove / move / setItemValue / replaceItem / clear
```

- `move` 只改变 item order，不把所有 descendant 伪装成 value changes，也不重建 Field/View state。
- remove 按 Item Identity 清理整个 Runtime subtree，包括 validation run token 和 View state。
- `setItemValue` 保留 item identity；`replaceItem` 表示新逻辑 item，可重建 identity。
- whole-array replace 默认重建 item identity；高级场景可注入 business-key Identity Resolver。
- 业务 ID 不直接充当 ArrayItemId，避免重复、缺失和变化污染内部身份。
- reset 首期重建 array runtime identity，语义是恢复初始 Form state。

Object missing container 可以在合法 ModelPath 上按需 materialize；Array item 不允许通过越界 InstancePath 隐式创建，必须使用 Array API。

Nested Form 不创建第二套 Runtime/Store，只返回带 base path 和 instance binding 的轻量 scoped facade。

## 13. Widget Protocol

Widget 不是组件别名，而是框架无关的交互协议：

```text
WidgetDefinition
  |- name
  |- valueContract
  |- interaction
  |- propsContract
  |- matchers
  |- capabilities
  `- defaults
```

- value contract 定义 Core canonical value，例如 date 使用 ISO date string/null。
- props contract 定义标准化逻辑 props，并可用 Schema 描述以支持校验和 Builder。
- interaction contract 使用 `setValue`、`touch`、`focus` 等语义事件，不暴露 DOM event。
- capabilities 描述 readonly、disabled、clearable、multiple、inlineLabel 等能力。
- Widget 只负责输入控件；label、help、required presentation、errors 由 FieldChrome 负责。

WidgetDefinition 不包含 Vue/React component、native props/events、UI library 类型或 Runtime state。

首期内置逻辑 Widget 至少包括 text、textarea、number、select、multi-select、checkbox、switch、date、datetime；Object/Array 也允许通过自定义 Widget 作为 canonical object/array value 的原子控件。

## 14. Framework Renderer 与 UI Adapter

不存在 Universal Renderer 或 Universal UIAdapter。

```text
Core logical protocol
  +-- @form/vue   -> VueUIAdapter   -> Element Plus / Ant Design Vue / ...
  `-- @form/react -> ReactUIAdapter -> MUI / Ant Design React / Mantine / ...
```

VueRenderer 和 ReactRenderer 独立实现树遍历、生命周期和订阅，但共享 ViewTree、Runtime、Snapshot 和行为规范。

Renderer 规则：

- FieldRenderer/ViewRenderer 是主要订阅边界，container 不订阅不需要的数据。
- Array 使用 ArrayItemId 作为 framework key。
- ModelPath 通过 RenderScope/InstanceBinding 解析为 InstancePath。
- Widget 默认 controlled；domain value 始终由 Runtime 控制。
- Framework Context 只保存稳定依赖，不保存整个 mutable form snapshot。
- 隐藏默认卸载 native component，但不清除 domain value 或 Field state。

每个 framework-specific UIAdapter 由以下部分构成：

```text
UIAdapter
  |- FormAdapter
  |- FieldChromeAdapter
  |- WidgetAdapterRegistry
  `- LayoutAdapterRegistry
```

WidgetAdapter 通过 component binding、props mapper、value codec 和 interaction binding 把逻辑协议翻译为 native component。复杂场景可使用 framework-specific custom render escape hatch。

Adapter 不拥有业务 Form state，不启用 UI 库 Validation 作为真相，不直接修改 values。Capability 不满足时必须产生 diagnostic，不得静默降级。

## 15. Plugin 与 Environment

扩展策略固定为 `Registry-first, Hook-second`。

```text
FormPlugin contributions
  |- widgets
  |- schemaDialects
  |- schemaExtensions
  |- ruleFunctions
  |- validators
  |- serializers
  |- valueInitializers
  `- instrumentation
```

约束：

- 不使用 global singleton registry；Environment 显式创建。
- Registry key 和 Plugin ID 冲突默认报错；需要覆盖时必须由 Environment 配置显式批准，不允许后注册者静默覆盖。
- Plugin 可声明依赖；安装顺序确定且可诊断。
- Plugin 可声明其兼容的 protocol version；不兼容必须在 Environment build 阶段产生 diagnostic。
- Environment 在 build 完成后冻结，compile/runtime 期间不可随意修改。
- Core `FormEnvironment` 与 framework `RendererEnvironment` 分离。
- Widget Definition 位于 FormEnvironment；Widget rendering binding 位于 RendererEnvironment。
- Instrumentation 默认只读，不允许 `beforeSetValue` 改值或 `afterCompile` 改 model。
- Plugin 是逻辑能力集合，与 npm package 发布单位解耦。

`FormEnvironment` 是受限依赖容器，不演变成通用 DI Framework。

`definePlugin()` 与 `defineForm()` 一样是无副作用的 authoring helper，只负责类型推导、输入规范化和静态检查；它不安装插件，也不修改任何全局 Registry。

## 16. Public API

### 16.1 简单路径

```ts
const definition = defineForm({ schema, uiSchema, rules, config })

const { model, diagnostics } = compileForm(definition)
const form = createForm(model, { initialValues })
```

简单路径使用默认 Core Environment。需要显式 Environment、但不需要长期复用 Engine 时，两个阶段必须使用同一个 Environment：

```ts
const environment = createFormEnvironment({ plugins: [companyPlugin] })
const { model, diagnostics } = compileForm(definition, { environment })
const form = createForm(model, { environment, initialValues })
```

`compileForm()` 无法产生合法模型时抛出 `CompileError`；成功返回的 `CompileResult.model` 始终存在。

Vue：

```vue
<FormRenderer :form="form" :adapter="elementPlusAdapter" />
```

React：

```tsx
<FormRenderer form={form} adapter={muiAdapter} />
```

### 16.2 Engine 路径

```ts
const engine = createFormEngine({ plugins: [companyPlugin] })
const { model, diagnostics } = engine.compile(definition)
const form = engine.create(model, { initialValues })
```

`FormEngine` 只封装 frozen Environment、Compiler factory 和 Runtime factory，不保存任何具体 Form 实例状态。

### 16.3 FormInstance

高频能力保持顶层，复杂能力使用 facade：

```text
form.getValue(path)
form.setValue(path, value)
form.getValues()
form.setValues(values)
form.getState()
form.getField(path)
form.array(path)
form.scope(path)
form.validate()
form.reset()
form.serialize(options?)
form.submit(handler)
```

- `getField()` 返回轻量 `FieldInstance` facade。
- `array()` 返回 `ArrayInstance` facade，并可按 index 或 ArrayItemId 获取 item scope。
- `scope()` 返回共享同一 Runtime 的 `ScopedFormInstance`。
- State API 返回 readonly snapshot；不公开 Store、TransactionManager 或 RuntimeNodeId。
- selector/subscription 属于 Advanced Runtime API；应用优先使用 Vue composables 或 React hooks。
- `submit()` 负责 submitCount、validation、serialization 和 submitting state，但不内置 HTTP。validation invalid 返回结构化结果；业务 handler 异常不应被静默吞掉。

### 16.4 导出层级

Public API 按使用角色分为三层：

```text
Application API
  defineForm / compileForm / createForm / createFormEngine
  FormInstance / FieldInstance / ArrayInstance / ScopedFormInstance
  CompiledFormModel / CompileResult / CompileError / Diagnostic

Advanced Runtime API
  readonly selectors / subscriptions / snapshots
  readonly instrumentation and model inspection views

Extension API
  definePlugin / createFormEnvironment
  defineWidget / defineValidator / defineRuleFunction
  typed Registry contribution and Adapter protocols
```

`@form/core` 主入口只导出 Application API、公共接口、readonly model 和 diagnostics。Advanced Runtime API 与 Extension API 从 `@form/core/runtime`、`@form/core/extension` 或等价 subpath export 导入，避免普通业务代码依赖内部概念。Framework package 对外提供语义对应的 renderer、hooks/composables 和 snapshot binding。

以下实现细节不得从主入口公开：

```text
TransactionManager / ValueStoreImpl / StateStoreImpl
mutable DependencyGraph / CompilerContext / Shape internals
RuntimeNodeId generation / Change Queue / EffectScheduler
renderer internal context
```

Public object 优先暴露 interface + factory，不暴露可直接 `new` 的内部 class。

## 17. npm Package Boundary

首期发布包：

```text
@form/core
@form/validator-ajv
@form/vue
@form/react
@form/element-plus
@form/mui
```

验证架构后再增加：

```text
@form/ant-design-vue
@form/antd-react
其他 framework/UI adapters
```

不拆分 `@form/compiler`、`@form/runtime`、`@form/schema`、`@form/rules`、`@form/validation`。它们是 Core 内部模块边界，不是独立使用或发布边界。AJV 独立成包，因为它是明确的第三方依赖和替换边界。

包依赖方向：

```text
@form/validator-ajv ------> @form/core
@form/vue ----------------> @form/core
@form/react --------------> @form/core
@form/element-plus -------> @form/vue + @form/core
@form/mui ----------------> @form/react + @form/core
```

Vue/React 和 UI 库通过 peerDependencies 表达宿主依赖。

## 18. Monorepo 与目录结构

```text
repo/
  |- packages/
  |    |- core/
  |    |- validator-ajv/
  |    |- vue/
  |    |- react/
  |    |- element-plus/
  |    `- mui/
  |- examples/
  |    |- shared/            # playground catalog 与框架无关编译管线（非 v1 必选验收目录）
  |    |- vue-element-plus/  # smoke + 可浏览 Vite 工作台（Element Plus）
  |    `- react-mui/         # smoke + 可浏览 Vite 工作台（MUI）
  |- tests/
  |- docs/
  |- package.json
  |- pnpm-workspace.yaml
  `- tsconfig.base.json
```

Core 按生命周期/大能力分层，内部再按领域组织：

```text
packages/core/src/
  |- definition/
  |- schema/
  |- compiler/
  |    |- schema/
  |    |- shape/
  |    |- data/
  |    |- ui/
  |    |- rule/
  |    |- validation/
  |    `- dynamics/
  |- model/
  |    |- data/
  |    |- ui/
  |    |- rule/
  |    |- validation/
  |    |- schema-dynamics/
  |    |- path/
  |    `- identity/
  |- runtime/
  |    |- form/
  |    |- value/
  |    |- state/
  |    |- transaction/
  |    |- array/
  |    |- dependency/
  |    |- subscription/
  |    |- scope/
  |    |- rule/
  |    |- validation/
  |    `- dynamics/
  |- widget/
  |- rule/
  |- validation/
  |- extension/
  |- diagnostic/
  |- engine/
  `- index.ts
```

其他首期 package 的内部边界：

```text
packages/validator-ajv/src/
  |- ajv-validator-adapter.ts
  |- ajv-error-normalizer.ts
  |- create-ajv-validator.ts
  `- index.ts

packages/react/src/
  |- renderer/       # Form/View/Field/Object/Array/Layout renderer
  |- context/        # stable Form and RenderScope context
  |- hooks/          # form/field/array/view snapshot bindings
  |- adapter/        # ReactUIAdapter protocols and factory
  |- test-utils/     # non-exported test helpers
  `- index.ts

packages/vue/src/
  |- renderer/       # Form/View/Field/Object/Array/Layout renderer
  |- context/        # stable Form and RenderScope context
  |- composables/    # form/field/array/view snapshot bindings
  |- adapter/        # VueUIAdapter protocols and factory
  |- test-utils/     # non-exported test helpers
  `- index.ts

packages/element-plus/src/
  |- widgets/
  |- layouts/
  |- field-chrome/
  |- form/
  |- create-element-plus-adapter.ts
  `- index.ts

packages/mui/src/
  |- widgets/
  |- layouts/
  |- field-chrome/
  |- form/
  |- create-mui-adapter.ts
  `- index.ts
```

Framework package 只实现渲染、生命周期和订阅绑定，不重复实现 validation、rule、ValueStore 或其他 Core Runtime。UI library package 只包含该组件库的 Widget/Layout/FieldChrome/Form bindings。

目录约定：

- 按领域高内聚，不建立全局 `types/`、`services/`、`utils/` 垃圾桶。
- 类型与拥有它的领域 colocate；局部 `array-utils.ts` 等文件允许存在。
- 每个领域可有内部 `index.ts`，但最终 package public surface 只由 package root exports 决定。
- 内部模块可以直接 relative import，避免过深 barrel 造成循环依赖。
- 测试优先与领域代码 colocate；顶层 `tests/` 只放跨包集成、契约和端到端测试。
- React/Vue 目录语义对应，但遵循各自生态习惯（hooks vs composables），不追求机械一致。

## 19. Diagnostics 与兼容性

统一 Diagnostic 至少包含：

```text
code / severity / message / source
schemaPath? / modelPath? / pluginId? / metadata?
```

Schema Frontend、Compiler、Plugin installation、Adapter capability 和 Runtime instrumentation 都可以产生 diagnostics。`diagnostic` 是底层横切模块，不反向依赖这些上层模块。

系统必须显式报告以下类型的问题：

- unsupported/partially-supported JSON Schema generation feature；
- UI Schema 或 Layout 引用不存在的 ModelPath；
- Widget 无匹配或 Adapter capability 不足；
- Rule/Validator function 未注册、dependency cycle；
- Plugin ID/registry key 冲突、依赖缺失或 protocol version 不兼容；
- 非法 mutation、数组越界或 effect 不收敛。

## 20. 首期范围与延后事项

首期必须验证的垂直切片：

1. Draft 2020-12 常用 Object/Array/Scalar schema 编译。
2. 默认 ViewTree 与显式 layout。
3. text/number/select/boolean/date 等逻辑 Widget。
4. Vue + Element Plus 与 React + MUI 两条完整渲染链路。
5. transactional set/setValues 和 selector subscription。
6. Array append/insert/remove/move 与稳定 ArrayItemId。
7. State/Computed rules、dependency indexing 和 cycle diagnostics。
8. AJV schema validation、同步 custom validation、async latest-wins、server errors。
9. conditional static superset、active semantics 和 active-only serialization。
10. Plugin/Environment registry freeze 和冲突 diagnostics。

明确延后：

- 完整覆盖所有 JSON Schema 关键字的自动 UI 生成；
- 任意动态修改 Compiled Model；
- async rule / 内置远程 DataSource；
- 万能生命周期 hooks；
- 独立 nested runtime store；
- DevTools 对内部 mutable graph 的直接访问；
- 编译器/运行时拆成独立 npm 包；
- 为所有 UI 库一次性提供 Adapter。

## 21. 架构验收标准

实现达到以下条件时，说明分层成立：

- 同一 FormDefinition 和业务 Plugin 可在 Vue/Element Plus 与 React/MUI 中复用。
- `@form/core` 的依赖树中不存在 Vue、React、DOM UI library 和 AJV。
- 编译结果可被检查和缓存，并且创建多个 FormInstance 时状态完全隔离。
- 数组 move 后，业务 item 的 touched/error/view state 跟随 ArrayItemId，而不是旧 index。
- 单字段更新只通知受影响 selector，不触发整表订阅者树重算/重渲染。
- Rule/Validation 看到 transaction 的稳定数据，外部订阅者看不到中间态。
- UI Adapter 无法绕过 Runtime Command 修改 values。
- unsupported schema/widget/adapter/plugin 情况均有结构化 diagnostic，不依赖静默 fallback。

---

这份架构的核心可以压缩为一句话：**以 JSON Schema 为数据契约，将其编译为不可变、框架无关的 Form IR，再由事务化 Runtime 实例化状态，最终通过各框架独立 Renderer 和 UI Adapter 完成呈现。**
