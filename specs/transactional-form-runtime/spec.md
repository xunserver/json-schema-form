# transactional-form-runtime Specification

## Purpose

为不可变 `CompiledFormModel` 提供框架无关、实例隔离且事务化的基础 Runtime，使应用和后续 Dynamics、Rule、Validation、Array 与 Renderer 能共享唯一 values 真相、原子命令和精确稳定的只读订阅边界。

## Requirements

### Requirement: Compiled Model 通过一致 Environment 实例化
Core 必须（SHALL）支持从不可变 `CompiledFormModel` 创建 `FormInstance`，并保证 compile 与 instantiate 使用同一个 frozen `FormEnvironment`。默认短路径必须（MUST）在两个阶段使用同一个 Core 默认 Environment；显式 Environment 或 `FormEngine` 路径发生 identity mismatch 时必须（MUST）在创建任何实例状态前失败并产生 `source: "runtime"` 的结构化 Diagnostic。

#### Scenario: 使用默认 Environment 创建表单
- **GIVEN** `compileForm(definition)` 使用默认 Core Environment 成功生成 Model
- **WHEN** 调用者执行 `createForm(model, { initialValues })`
- **THEN** 返回可用 `FormInstance`，且 Model 保持不可变

#### Scenario: 拒绝不同 Environment 的 Model
- **GIVEN** Model 使用一个显式 `FormEnvironment` 编译，而调用者用另一个独立构建的 Environment 创建实例
- **WHEN** 执行 `createForm()` 或 `engine.create()`
- **THEN** 创建以 environment-mismatch Diagnostic 失败，且不返回 partial `FormInstance`

#### Scenario: Engine 固定同一生命周期依赖
- **GIVEN** 调用者用业务 Plugin 创建 `FormEngine`
- **WHEN** 通过该 Engine 重复 compile Definition 并从其 Model 创建实例
- **THEN** Engine 始终复用其 frozen Environment，且不保存任何具体实例的 values 或交互状态

### Requirement: named Value Initializer 在实例化前产出 Runtime-owned initial values
`createForm()` 与 `engine.create()` 必须（SHALL）按以下优先级决定 Value Initializer：create option 显式 key、否则 Compiled Model 记录的 `FormConfig.valueInitializer`、否则不使用 initializer。选定的 initializer 必须（MUST）来自与 Compiled Model 一致的冻结 Environment，在 array identity materialization、Computed/Effect/activation 稳定与任何 snapshot 发布之前同步运行一次；它只接收调用者提供的 readonly initial values 与只读 `CompiledFormModel`，返回值经 JSON-compatible 校验后成为 Runtime-owned initial snapshot，`reset()` 恢复该结果而非调用者原始输入。initializer 不得（MUST NOT）取得 Store、Transaction、Scheduler 或任何 command；其 throw、返回 thenable、返回非 JSON 或未注册 key 必须（MUST）以 `source: "runtime"` 的稳定 Diagnostic 阻断创建，不产生 partial instance，也不泄漏原始异常。

#### Scenario: 默认 initializer 填充初始值
- **GIVEN** Compiled Model 记录 `valueInitializer: "company.defaults"`，该 initializer 为缺失的 `country` 填入 `"CN"`
- **WHEN** 调用 `createForm(model, { environment, initialValues: { name: "Ada" } })`
- **THEN** 实例的 initial snapshot 为 `{ name: "Ada", country: "CN" }`，`version` 为 0，dirty 为 false，调用者传入的对象未被修改

#### Scenario: create option 覆盖默认 initializer
- **GIVEN** Compiled Model 记录默认 initializer，调用者在 create option 中指定另一个已注册 key
- **WHEN** 创建实例
- **THEN** 只运行 option 指定的 initializer，Compiled Model 与 Definition 均不变化

#### Scenario: reset 恢复 initializer 结果
- **GIVEN** initializer 产出的 initial snapshot 已被多次 `setValue()` 修改
- **WHEN** 调用 `reset()`
- **THEN** values 恢复为 initializer 产出的 snapshot，而不是调用者原始 `initialValues`，且 initializer 不再次执行

#### Scenario: initializer 在 identity 与 Rule 稳定之前运行
- **GIVEN** initializer 向 `products` 追加两个 item，且存在依赖 `products[].price` 的 Computed Rule
- **WHEN** 创建实例
- **THEN** 两个 item 各获得稳定 `ArrayItemId`，Computed 结果基于 initializer 输出稳定，整个过程不对外发布中间态

#### Scenario: initializer 失败阻断创建
- **GIVEN** 选定的 initializer throw、返回 Promise 或返回含 function 的对象
- **WHEN** 调用 `createForm()`
- **THEN** 以稳定 `source: "runtime"` Diagnostic（含 initializer name）抛出 `FormRuntimeError`，没有可用 partial instance，diagnostic 不包含原始异常

#### Scenario: 拒绝未注册或跨 Environment 的 initializer
- **GIVEN** create option 指定的 key 未在与 Compiled Model 一致的 Environment 中注册
- **WHEN** 创建实例
- **THEN** 创建在任何实例状态建立前以结构化 Diagnostic 失败，且不会回退到默认 initializer 或原始 values

### Requirement: 多个 FormInstance 的 Runtime state 完全隔离
从同一个 `CompiledFormModel` 创建的每个 `FormInstance` 必须（MUST）拥有独立的 current/initial values 与 Node、Field、View、Form source state。创建、mutation、reset 或订阅任一实例不得（MUST NOT）改变 Model、Environment 或其他实例。

#### Scenario: 同一 Model 创建两个隔离实例
- **GIVEN** 两个 `FormInstance` 从同一个 Model 以不同 initial values 创建
- **WHEN** 第一个实例修改 value、touch Field 并 focus View
- **THEN** 第二个实例的 values、state、version 与订阅均不变化

#### Scenario: Runtime 不修改编译模板
- **GIVEN** 调用者保留 Model 的 Data/UI/Rule/Validation/Dynamics 与 diagnostics 引用
- **WHEN** 任意实例执行多个成功或失败的命令
- **THEN** 所有 Model 内容与引用语义保持不变，且其中不出现实例 source state

### Requirement: 嵌套 values 是唯一 value source
Runtime 必须（MUST）以正常嵌套的 business values 作为唯一 value source；Node、Field 与 View state 不得（MUST NOT）复制 value。`getValues()`、`getValue(InstancePathLike)`、Form/Field snapshot 必须（MUST）从同一已提交 values snapshot 得出，initial values、mutation input 与公开对象不得保留可从外部修改 Runtime 的 mutable alias。

#### Scenario: Field 与 Form 读取同一嵌套值
- **GIVEN** initial values 包含 `{ profile: { name: "Ada" } }`
- **WHEN** 分别通过 `getValue("profile.name")`、`getField("profile.name")` 与 Form snapshot 读取
- **THEN** 三者观察到同一个已提交业务值语义，而 Field state 中不存在第二份可写 value

#### Scenario: 公开 snapshot 不可用于绕过命令
- **GIVEN** 调用者取得完整 values 或某个 object value 的公开 snapshot
- **WHEN** 尝试修改、删除或追加其嵌套内容
- **THEN** 公共类型拒绝该修改，且 Runtime 后续读取保持不变、version 不递增

### Requirement: 基础 value 与交互命令具有明确语义
`FormInstance` 必须（SHALL）提供 `setValue()`、`setValues()`、`touch()`、`focus()`、`blur()`、`setCollapsed()`、`setActiveTab()` 与 `reset()` 命令。`setValues()` 必须（MUST）把传入的完整嵌套 values 作为一次原子 root replacement；`touch()` 以 Field `InstancePath` 为目标；`focus()`、`blur()`、`setCollapsed()` 与 `setActiveTab()` 以具体 `ViewNodeId` 为目标，只修改该 View 的 source state，不得（MUST NOT）修改 values、touched 或其他 View 的状态；`blur()` 不得（MUST NOT）隐式 touch。`reset()` 必须（MUST）恢复创建时的 initial values 和全部基础 source-state 默认值。合法 object path 上缺失的 object container 可以（MAY）按静态 Model materialize，但数组项不得（MUST NOT）通过越界 index 隐式创建。不属于静态 ViewTree 的 `ViewNodeId` 必须（MUST）以 `source: "runtime"` 的结构化 Diagnostic 拒绝。

#### Scenario: 原子替换完整 values
- **GIVEN** 当前 values 包含多个字段且调用者提供一份新的完整嵌套 values
- **WHEN** 调用 `setValues(nextValues)`
- **THEN** 所有差异在同一次 commit 中生效，未出现在 nextValues 中的旧 root 内容不会按隐式 deep-merge 保留

#### Scenario: touch 与 focus 使用不同身份
- **GIVEN** 同一 Field 在 ViewTree 中有两个不同 `ViewNodeId` 的呈现
- **WHEN** touch 该 Field 并只 focus 其中一个 View
- **THEN** touched 由 Field 共享，而 focused 只属于目标 View，另一个 View 不被标记 focused

#### Scenario: blur 清除目标 View 的 focused
- **GIVEN** 某 View 已通过 `focus(viewId)` 处于 focused 状态，且其 Field 尚未 touched
- **WHEN** 调用 `blur(viewId)`
- **THEN** 该 View 的 focused 变为 false，Field touched 与 values 均不变，`version` 恰好递增一次并只发布一次稳定 snapshot

#### Scenario: 对未 focused 的 View blur 是 no-op
- **GIVEN** 某 View 当前 focused 为 false
- **WHEN** 调用 `blur(viewId)`
- **THEN** 命令按 effective no-op 处理：`version` 不变、不运行后续 phase、不通知任何订阅者

#### Scenario: collapsed 与 activeTab 属于具体 View
- **GIVEN** 一个 Group View 与其中一个 Field View 各有独立 `ViewNodeId`
- **WHEN** 调用 `setCollapsed(groupViewId, true)` 与 `setActiveTab(groupViewId, "advanced")`
- **THEN** 只有该 Group View 的 snapshot 报告 `collapsed: true` 与 `activeTab: "advanced"`，Field View 与其他 View 保持默认值 `false`/`undefined`，Core 不解释 tab key 是否存在于 layout

#### Scenario: reset 恢复初始基础状态
- **GIVEN** values、touched、focused、collapsed 与 activeTab 已通过多个 transaction 改变
- **WHEN** 调用 `reset()`
- **THEN** values 恢复 Runtime-owned initial snapshot，touched/focused/collapsed/activeTab 全部恢复默认值，并作为至多一次有效 commit 对外发布

#### Scenario: 拒绝隐式创建数组项
- **GIVEN** 当前数组没有 index 3 对应的 item
- **WHEN** 调用者尝试通过 `items[3].name` 写入
- **THEN** 命令以结构化 Runtime Diagnostic 失败，且不会扩展数组或创建伪造 item identity

#### Scenario: 拒绝未知 View 的交互命令
- **GIVEN** 调用者传入一个不属于该 Compiled ViewTree 的 `ViewNodeId`
- **WHEN** 调用 `blur()`、`setCollapsed()` 或 `setActiveTab()`
- **THEN** 命令以稳定 `source: "runtime"` Diagnostic 失败，`version`、snapshot identity 与订阅者均不变化

### Requirement: Source 与 derived state 保持分离
Runtime snapshot 必须（MUST）区分 source state 与 derived state：value 来自 nested values，touched 来自 Field source state，focused、collapsed 与 activeTab 来自 View source state，Form/Node/Field 的 dirty 与 aggregate touched 从 initial/current values 和 descendants 推导。派生值不得（MUST NOT）作为第二份可直接修改的 source 保存；Schema `active` 与 UI `visible` 也不得（MUST NOT）在基础 Runtime 中合并为同一状态。View source state 只能（MUST）通过对应 View command 修改，公开 snapshot 保持只读。

#### Scenario: value 往返后 dirty 恢复
- **GIVEN** 一个 Field 的 initial value 为 `A`
- **WHEN** 先将其改为 `B`，再在后续 transaction 改回 `A`
- **THEN** Field 及其 ancestor 的 derived dirty 恢复为 false，而不需要直接写 dirty flag

#### Scenario: descendants 聚合 touched
- **GIVEN** 一个 Object 下有多个 Field 且当前均未 touched
- **WHEN** 其中一个 descendant Field 被 touch
- **THEN** 该 Field 与其 ancestor/Form 的 aggregate touched 为 true，未触及的 sibling Field 保持 false

#### Scenario: View source state 不可绕过命令修改
- **GIVEN** 调用者通过 `viewSelector` 或 `getState()` 取得包含 `focused`、`collapsed`、`activeTab` 的 View snapshot
- **WHEN** 尝试直接改写这些属性
- **THEN** 公共类型与运行时只读边界拒绝该修改，Runtime state 与 `version` 均不变化

#### Scenario: active 与 visible 不被基础状态冒充
- **GIVEN** Model 包含 conditional activation metadata 和 UI visible policy
- **WHEN** 仅使用基础 no-op Dynamics/Rule phase 创建实例
- **THEN** Runtime 不把 visible 推断为 active，也不宣称已执行 conditional 或 Rule 语义

### Requirement: focus-to-blur interaction 通过只读端口供后续 phase 消费
Runtime 必须（SHALL）在同一 transaction 的 normalized change set 中记录本次 commit 内由 focused 变为非 focused 的 View 及其所属 Field 的 instance binding，并通过与既有 activation/rule/validation phase 相同的只读 context 提供给后续 Core owner。该端口不得（MUST NOT）从任何公共入口导出 writer，不得（MUST NOT）暴露 `RuntimeNodeId`，也不得（MUST NOT）让 Renderer 或 Plugin 伪造 interaction event。

#### Scenario: blur 记录所属 Field binding
- **GIVEN** 一个数组 item 内的 Field View 处于 focused 状态
- **WHEN** 调用 `blur(viewId)` 并由测试 Validation owner 读取 phase context
- **THEN** context 报告该 View 与其 Field 的当前 `InstancePath` 及稳定 `ArrayItemId` chain，且不包含 `RuntimeNodeId`、Store 或 writer

#### Scenario: 非 blur 命令不产生 interaction 记录
- **GIVEN** 同一实例先后执行 `setValue()` 与 `focus()`
- **WHEN** 后续 phase 读取 change set
- **THEN** 两次 commit 的 change set 中 blur interaction 列表为空，`focus()` 只记录 focused View 的变化

#### Scenario: 被删除 item 的 blur 记录不泄漏到新 item
- **GIVEN** 某 item 的 View 曾 focused，随后该 item 被 `remove` 且新 item 进入同一 index
- **WHEN** 检查 remove commit 的 change set 与后续 blur 命令
- **THEN** remove 只按 subtree lifecycle 清理旧 View 的 focused 状态而不生成 blur interaction，新 item 的 View 不继承任何 focused/blur 记录

### Requirement: 每个 public mutation 都原子提交
每个 public mutation 必须（MUST）在单一 transaction 中校验并应用其全部 source changes，在成功时至多 commit 一次并将 `version` 恰好递增一次。命令校验或已启用 phase 失败时必须（MUST）保留 transaction 前的 values/state/version，且订阅者不得（MUST NOT）观察半完成状态。

#### Scenario: setValues 不发布中间字段组合
- **GIVEN** selector 同时读取 `start` 与 `end`
- **WHEN** `setValues()` 在一个调用中替换二者
- **THEN** selector 只可能看到 commit 前或 commit 后的完整组合，不会看到只更新一个字段的中间值

#### Scenario: 失败 transaction 完全回滚外部观察
- **GIVEN** 一个 transaction 已暂存 value 与 touched change，但后续 phase 返回阻断失败
- **WHEN** transaction 结束
- **THEN** values、source state 和 version 均保持 commit 前语义，且没有普通 subscription 被通知

#### Scenario: 一次 transaction 只增加一个版本
- **GIVEN** 一个命令引起多个 values、Field state 与后续 phase change
- **WHEN** 它们成功稳定并 commit
- **THEN** 所有变化共享同一个新 version，外部不会看到多个部分 commit

### Requirement: Effective no-op 跳过流水线与发布
当命令或 command batch 的最终 source state 与当前已提交状态语义相同时，Runtime 必须（MUST）将其视为 no-op：不得（MUST NOT）递增 version、调用后续 Dynamics/Rule/Validation phase、重建无关 snapshot 或通知 subscription。

#### Scenario: 重复设置相同值
- **GIVEN** path 当前已持有与输入语义相同的嵌套值
- **WHEN** 调用 `setValue()` 或以等价完整 values 调用 `setValues()`
- **THEN** version 与现有 snapshot identity 保持不变，phase probe 和 subscriber 都不被调用

#### Scenario: 重复交互状态命令为 no-op
- **GIVEN** 一个 Field 已 touched 或一个 View 已处于目标 focused 状态
- **WHEN** 再次提交相同状态
- **THEN** Runtime 不产生 commit 或订阅通知

### Requirement: 后续 Runtime phase 只能按固定顺序参与同一 transaction
Runtime 必须（SHALL）为 Schema activation、Rule/effect、sync Validation 与 async Validation scheduling 保留有序且受限的 phase contract。一个有效 value change 必须（MUST）依次经过 activation、Rule/effect 稳定处理和 sync Validation 后才可 commit/publish，async scheduling 只能（MUST）发生在 commit 后；phase 新增的声明式 mutation 必须（MUST）加入当前 change processing 并在稳定后一次发布，不得递归发布嵌套 transaction，也不得取得公开可变 Store。

#### Scenario: Phase 观察顺序固定
- **GIVEN** 测试装配了只记录输入 version/change set 的 activation、Rule、sync Validation 与 async scheduling probe
- **WHEN** 一个有效 value mutation 成功执行
- **THEN** probe 顺序恒为 activation、Rule/effect、sync Validation、commit/publish、async scheduling，且前三者看不到外部已发布的中间 version

#### Scenario: Phase command 留在当前 transaction
- **GIVEN** Rule/effect phase 根据一个 value change enqueue 另一个声明式 value change
- **WHEN** change processing 在限制内收敛
- **THEN** 两个 value change 共享一次 commit、一个 version 和一次稳定 publish

#### Scenario: 不收敛不发布
- **GIVEN** phase 持续 enqueue mutation 并超过确定的 command 或 iteration limit
- **WHEN** Runtime 检测到不收敛
- **THEN** transaction 以稳定 Runtime Diagnostic 失败，保留 commit 前状态且不通知普通 subscriber

### Requirement: Selector subscription 只发布受影响的稳定 snapshot
Advanced Runtime API 必须（SHALL）提供只读、可组合且声明依赖的 selector/snapshot/subscription contract。Runtime 必须（MUST）只重新求值依赖与本次 committed change set 相交的 selector，并且只在其选中结果变化时通知 subscriber；同一 selector 在依赖未变化期间必须（MUST）返回 referentially stable 的 readonly snapshot。

#### Scenario: 单字段更新只通知相关 selector
- **GIVEN** 分别订阅 `firstName`、`age` 与 Form aggregate 的 selector
- **WHEN** 只修改 `firstName`
- **THEN** `firstName` 与受影响 aggregate subscriber 被通知，`age` selector 不重新求值也不通知

#### Scenario: 依赖变化但选择结果不变
- **GIVEN** 一个 derived selector 的输入依赖发生变化但 projector 结果仍相等
- **WHEN** transaction commit
- **THEN** Runtime 可以重新求值该 selector，但不得通知其 subscriber，且后续读取复用稳定结果

#### Scenario: 取消订阅后不再通知
- **GIVEN** 调用者已通过返回的 unsubscribe 操作取消一个 subscription
- **WHEN** 后续 transaction 改变其依赖
- **THEN** 该 subscriber 不再被调用，且取消操作可重复执行而不改变 Runtime state

### Requirement: Subscriber 异常与 Runtime diagnostics 被隔离
Subscriber 必须（MUST）只在 commit 后调用；单个 subscriber 抛出的异常不得（MUST NOT）回滚已完成 commit、阻止同次 publish 的其他 subscriber 或使其自动重试。Runtime 必须（MUST）通过 Advanced diagnostic observation contract 报告该非阻断问题；非法 access、创建和 command 失败则必须（MUST）以包含只读 Runtime diagnostics 的结构化错误暴露。

#### Scenario: Subscriber 抛错不回滚
- **GIVEN** 同一 selector 有两个 subscriber，首个在通知时抛错
- **WHEN** 相关 transaction 已 commit
- **THEN** 新 values/version 保持提交，第二个 subscriber 仍收到稳定 snapshot，并产生 subscriber-error Runtime Diagnostic

#### Scenario: 非法 Path 不产生 partial mutation
- **GIVEN** 一个语法非法或无法映射到 Model 的 `InstancePathLike`
- **WHEN** 调用者读取或执行基础 command
- **THEN** 获得包含 path 与稳定 code 的只读 Runtime Diagnostic；mutation 情况下 values/state/version 不变

#### Scenario: Diagnostic observer 无权修改 Runtime
- **GIVEN** Advanced API 的 diagnostic observer 收到 subscriber 或 instrumentation 异常信息
- **WHEN** observer 检查事件
- **THEN** 事件只包含只读 Diagnostic 与已提交 version 信息，不包含 Store、change queue、Transaction Manager 或 mutation capability

### Requirement: 基础 Runtime 不抢占后续公共能力所有权
本 capability 不得（MUST NOT）把数组 index 当作身份，不得实现 Schema/Rule/Validation 业务求值，也不得从基础 `FormInstance` 声称已交付 `array()`、`scope()`、`validate()`、`applyErrors()`、`submit()` 或 `serialize()`。后续能力必须（MUST）扩展同一 FormInstance、transaction、snapshot 与 subscription 语义，而不能建立第二套 Runtime/Store。

#### Scenario: 后续 facade 尚未被基础 Runtime 虚构
- **GIVEN** 消费者只安装本 change 交付的 Core Runtime
- **WHEN** 检查基础 `FormInstance` 公共契约
- **THEN** 可以使用基础 value/state/Field/reset API，但数组、scope、validation、submit 与 serializer facade 尚不属于该契约

#### Scenario: Extension 不可绕过 transaction
- **GIVEN** 后续 Dynamics、Rule、Validation 或 Array 模块接入基础 Runtime
- **WHEN** 其需要改变 value 或 source state
- **THEN** 只能通过受限 phase/command contract 加入同一 transaction，无法取得公开 mutable Store 或修改 `CompiledFormModel`
