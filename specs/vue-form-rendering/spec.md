# vue-form-rendering Specification

## Purpose

为不可变 Form Model 和事务 Runtime 提供 Vue 3 呈现边界，使最终 ViewTree、实例 scope 与只读 effective snapshots 能被精确、可控并支持 SSR 地映射为组件树，而不在 Renderer 中重做 Core 语义。

## Requirements

### Requirement: Vue Renderer 只遍历最终 resolved ViewTree
`@form/vue` 必须（SHALL）提供 `FormRenderer`、`ViewRenderer`、`FieldRenderer` 以及 Object、Array、Group/Grid 等 View kind 的遍历行为。Renderer 必须（MUST）把 `CompiledFormModel.ui.viewTree` 视为唯一呈现结构，按编译后的 Field 引用、children 顺序与 layout 参数呈现；不得（MUST NOT）读取 JSON Schema、Rule/Validation source、原始 UI Schema，或在运行时补 Field、Widget、`remaining-fields` 与 layout。

#### Scenario: 默认与显式 layout 使用同一遍历入口
- **GIVEN** 两份模型分别由缺省 layout 和显式 authoritative layout 编译，且都已有最终 ViewTree
- **WHEN** `FormRenderer` 呈现两份模型
- **THEN** Renderer 只按各自最终节点及顺序遍历，不查询其 layout 来源，也不自动追加未出现在树中的 Field

#### Scenario: 重复 FieldView 不复制 Field 真相
- **GIVEN** 两个不同 `ViewNodeId` 的 FieldView 引用同一 FieldDescriptor
- **WHEN** 两个 View 被呈现
- **THEN** 它们拥有独立 View interaction binding，但共享同一 Data/Field value、touched 与 validation snapshots

### Requirement: Framework Context 只保存稳定依赖
Vue provide/inject Context 必须（MUST）只保存当前 `FormInstance`、冻结 Renderer environment/adapter 与当前 `RenderScope` 等稳定依赖，不得（MUST NOT）保存整棵可变 snapshot、values 副本、Element Plus Form store、Schema、Rule engine、Validation engine 或 Runtime writer。Context identity 必须（MUST）在无依赖替换的 commit 间保持稳定。

#### Scenario: sibling 更新不替换 Context
- **GIVEN** 一个 Field component 已注入 Form、adapter 与 scope Context
- **WHEN** 无关 sibling value 或 error 发生 commit
- **THEN** Context identity 不变，只有订阅该 sibling 或 ancestor aggregate 的 consumer 才收到相应更新

#### Scenario: nested renderer 复用同一 Runtime
- **GIVEN** Object、Array item 与递归 child 形成嵌套 View
- **WHEN** 子 Renderer 从 Context 派生 scope
- **THEN** 所有层级仍使用根 Form 的同一 Runtime/transaction，且 Context 不创建嵌套 Store

### Requirement: Vue composables 精确桥接 Core external store
`@form/vue` 必须（SHALL）提供基于受支持 Core runtime selector/subscription 的 readonly composables，用于 Form、Field、View、Array order/item 与 current binding snapshots。每个 composable 必须（MUST）仅订阅其显式 selector dependency，在语义结果变化时触发 Vue 更新，并在 component scope dispose、Form/selector/scope 替换时取消旧订阅；不得（MUST NOT）用整 Form 深度 watch 或轮询代替精确订阅。

#### Scenario: 无关 Field commit 不重渲染
- **GIVEN** 两个 sibling `FieldRenderer` 分别订阅自己的 effective Field snapshot
- **WHEN** 只有第一个 Field 的 value 和 presentable errors 改变
- **THEN** 第一个及相关 ancestor 更新，第二个 selector 不重新求值且第二个 Renderer 不因整 Form watch 重渲染

#### Scenario: scope 替换清理旧订阅
- **GIVEN** 一个 component 的 injected item scope 被合法替换或 component 被卸载
- **WHEN** Vue lifecycle 完成 rebinding/dispose
- **THEN** 旧 subscription 恰好取消，后续旧 binding commit 不再更新该 component，且没有重复 listener

### Requirement: RenderScope 与 ArrayItemId 决定动态实例呈现
Object/Array Renderer 必须（MUST）以 `RenderScope`/readonly `InstanceBinding` 将静态 `ModelPath` 解析为当前实例，并用 `ArrayItemId` 而非 index、business key 或 `InstancePath` 作为重复 item 的 Vue key。Item move 必须（MUST）保留同一 Vue subtree 与 Core Field/View state；remove、replace、clear 或 reset 作废 item 时必须（MUST）卸载 subtree 并释放其订阅。

#### Scenario: move 保留 item component 身份
- **GIVEN** array item `itemA` 的 native component 有局部非业务 UI 状态且 descendant Field 已 touched
- **WHEN** `itemA` 从 index 0 move 到 index 2
- **THEN** Vue key 仍为 `itemA`、component 与 Core state 跟随该 item，所有相对 path 解析到新 `InstancePath`

#### Scenario: 删除后旧 scope 不复用
- **GIVEN** 一个 array item 被 remove，随后相同 index 插入新 item
- **WHEN** Array Renderer 更新 children
- **THEN** 旧 key/subtree 被卸载，新 item 使用新 `ArrayItemId`，旧 subscription 不会绑定到新占用者

#### Scenario: RenderScope 只来自 Core owning 入口
- **GIVEN** `@form/vue` 需要在 Context 中保存当前 scope 并解析 `products[].name`
- **WHEN** 检查其类型与运行时依赖
- **THEN** `RenderScope`/`InstanceBinding` 类型与 `getRenderScope()` 均从 `@form/core/runtime` 导入，Vue 包不重新定义、不 deep import binding index，也不把 `ScopedFormInstance` 等含 writer 的 facade 放入 Context

### Requirement: 折叠与 Tab 状态只来自 Core View state
Group/Layout binding 若呈现可折叠区域或 Tab，必须（MUST）以 Core `ViewSnapshot.collapsed`/`activeTab` 为唯一状态来源，并只通过 `setCollapsed(viewId, ...)`/`setActiveTab(viewId, ...)` 公开命令修改；不得（MUST NOT）在 Vue 组件内保存可与 Core 分叉的折叠/Tab 副本。Layout adapter 必须（MUST）在 preflight 时校验 tab key 属于其 layout 参数，非法 key 产生 adapter diagnostic 而不写入 Core。

#### Scenario: 折叠状态经 Core 往返
- **GIVEN** 一个 Group View 由 Element Plus 折叠面板呈现且当前 `collapsed: false`
- **WHEN** 用户点击折叠且随后 Core 通过 `reset()` 恢复默认值
- **THEN** 点击只调用 `setCollapsed(viewId, true)`，面板状态跟随 snapshot 变化；`reset()` 后面板展开且组件内不存在残留的本地折叠状态

#### Scenario: 拒绝不属于 layout 的 tab key
- **GIVEN** Layout adapter 声明 tabs `["basic", "advanced"]`
- **WHEN** custom binding 尝试为该 View 提交 `setActiveTab(viewId, "other")`
- **THEN** adapter preflight 以 `source: "adapter"` diagnostic 拒绝并不调用 Core 命令，Core `activeTab` 与 `version` 不变

### Requirement: effective lifecycle 控制挂载但不清除 Core state
Renderer 必须（MUST）只从 readonly effective snapshot 决定 `active`、`visible`、`disabled` 与 `readonly` 呈现。默认情况下，`active: false` 或 `visible: false` 的 View 不挂载 native Widget；由 hidden/inactive 引起的卸载不得（MUST NOT）清除 domain value、Field touched/errors 或数组身份，重新 visible 时必须（MUST）从当前 Core snapshot 恢复。`field: false` 不得被 Renderer 解释为 runtime hide，因为对应 Field/View 已在 compile time 不存在。

#### Scenario: visible false 卸载但保留状态
- **GIVEN** 一个已输入、touched 且有 presentable error 的 Field 变为 `visible: false`，但其 DataNode 仍存在
- **WHEN** Renderer 更新组件树后该 Field 再次 visible
- **THEN** hidden 期间 native Widget 被卸载而 Core value/state 未被清除，重挂载时显示最新 canonical value 与有效状态

#### Scenario: field false 不产生占位 Renderer
- **GIVEN** compile 结果因 `field: false` 没有该 FieldDescriptor 和 FieldView
- **WHEN** Renderer 遍历最终 ViewTree
- **THEN** 不创建 hidden placeholder，也不从 Data Tree 猜测并补回该 Field

### Requirement: Widget 受控值与交互只经过语义命令
`FieldRenderer` 必须（MUST）把 Core snapshot 的 canonical value、effective disabled/readonly/required、Field touched 与 View focused 状态作为 Widget binding 的受控输入。Adapter 产生的交互必须（MUST）先由 codec 规范化，再通过 `setValue`、`touch`、`focus`、`blur` 等 semantic interaction port 调用 Core 公开 command（`blur` 对应 Core `blur(viewId)`，Renderer 在 native focus 切换与 focused View 卸载时负责调用它，因为 Core `focus()` 非独占且 `blur()` 不隐式 touch）；native event、component instance 与未经解码的 UI-library value 不得（MUST NOT）传入 Core 或直接修改 values/state。

#### Scenario: native change 转为一次 setValue
- **GIVEN** 一个受控 Widget 发出 UI-library change payload
- **WHEN** binding codec 接受该 payload
- **THEN** Renderer 只提交规范化 canonical value 的 `setValue` semantic command，最终显示值由后续 committed snapshot 决定

#### Scenario: blur 分离 Field 与 View state
- **GIVEN** 同一 Field 有两个 FieldView，用户在其中一个 native control focus 后 blur
- **WHEN** interaction port 处理 focus/blur policy
- **THEN** 对应 View focused state更新、共享 Field 按 policy touch，另一个 View 不获得 focused 副本且任何更新都不绕过 Runtime command

### Requirement: Renderer 只呈现 Core 选择的 validation 结果
Renderer 与 FieldChrome 必须（MUST）消费 Core readonly presentable errors、validating 与 submit state，并将同一 Field 的多个 View 映射到同一 error 真相；它们不得（MUST NOT）解释 Schema keyword、validator source 或 Rule 来决定 eligibility/presentation，也不得启用 framework/UI-library validation store 产生第二套 errors。

#### Scenario: raw error 暂不可展示
- **GIVEN** Core Field snapshot 有 raw error，但 presentation selector 在 touched/submit policy 下返回空 presentable errors
- **WHEN** Renderer 呈现 FieldChrome
- **THEN** Chrome 不展示该 raw error，Renderer 不自行检查 touched、submitCount 或 error source 覆盖 Core 选择

### Requirement: SSR 与 hydration 无 DOM 假设且结果确定
Vue Renderer 必须（SHALL）支持服务端 render：setup/render 期间不得（MUST NOT）读取 `window`、`document`、element ref 或安装长期 Runtime subscription；服务端只读取一次 committed readonly snapshot。相同 model、runtime snapshot、adapter 与 scope 必须（MUST）产生稳定的 View/Array keys 和等价结构，客户端 mount 后才安装 subscription，并能在 hydration 前状态已变化时收敛到最新 commit。

#### Scenario: 服务端 render 不泄漏 listener
- **GIVEN** 在无 DOM 的 Vue SSR 环境中呈现表单
- **WHEN** render 完成且请求上下文释放
- **THEN** 输出由 resolved ViewTree/snapshot 确定，Runtime 中没有该 SSR render 遗留的 subscriber 或 DOM access failure

#### Scenario: hydration 使用稳定 identity
- **GIVEN** server 与 client 使用同一 array item identity/order 和 ViewTree
- **WHEN** 客户端 hydration 并开始订阅
- **THEN** ViewNodeId/ArrayItemId keys 一致，随后只按最新 committed snapshot 更新而不以 index 重建 item subtree
