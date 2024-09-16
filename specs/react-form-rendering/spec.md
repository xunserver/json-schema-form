## Purpose

定义 React 如何只依赖 Core 的最终只读模型与运行时快照渲染表单，并在数组身份、精准订阅、受控交互、StrictMode、SSR 与 hydration 下保持同一业务真相。

## Requirements

### Requirement: Renderer 只遍历 resolved ViewTree
`@xunserver-jsf/react` 必须（SHALL）提供 `FormRenderer`、`ViewRenderer`、`FieldRenderer`、`ObjectRenderer`、`ArrayRenderer` 与 `LayoutRenderer`，并按 `CompiledFormModel.ui.viewTree` 已解析的 Field 引用、children 顺序与 layout 参数呈现。Renderer 不得（MUST NOT）读取或解释 JSON Schema、Rule/Validation source、原始 UI Schema，亦不得在 render-time 补 Field、推断 Widget、展开 `remaining-fields` 或改变编译模型。

#### Scenario: 编译结果决定呈现顺序
- **GIVEN** resolved ViewTree 已包含重复 Field view、Group、Grid、Object 与 Array 节点
- **WHEN** `FormRenderer` 渲染该实例
- **THEN** React 树严格按最终 ViewTree 的 kind、引用和顺序分发，且不重新解释 Definition source

#### Scenario: 原子对象 Widget 不被展开
- **GIVEN** 编译模型把一个 Object Field 解析为自定义原子 Widget view
- **WHEN** React Renderer 遍历该节点
- **THEN** 该节点进入 `FieldRenderer` 的 Widget binding，而不会隐式创建其属性 child views

### Requirement: Context 与 RenderScope 保持稳定绑定
React Context 必须（MUST）只保存当前 `FormInstance`、所选冻结 adapter 与 `RenderScope` 三类稳定依赖，不得（MUST NOT）保存 renderer environment、整 Form snapshot、values 副本、Schema、Rule/Validation engine、UI library store 或 Runtime writer。`RenderScope`/`InstanceBinding` 必须（MUST）把 ModelPath 解析到当前 InstancePath；数组项必须（MUST）以 `ArrayItemId` 作为 React key 和身份绑定，index 只能用于当前次序显示。

#### Scenario: sibling commit 不替换 Context
- **GIVEN** 一个 Field subtree 已从 Context 取得 form、adapter 与 scope
- **WHEN** 不相关 sibling Field 提交新值
- **THEN** Context identity 保持不变，只有相关 selector consumer 更新

#### Scenario: 数组 move 保持 item binding
- **GIVEN** 两个数组项各有稳定 `ArrayItemId` 和 descendant scope
- **WHEN** Core 执行 `move` 改变两项 index
- **THEN** React key 与 descendant binding 仍跟随各自 `ArrayItemId`，而 InstancePath 反映新 index

#### Scenario: RenderScope 类型只来自 Core owning 入口
- **GIVEN** `@xunserver-jsf/react` 在 Context 与 hooks 签名中使用 `RenderScope`/`InstanceBinding`
- **WHEN** 检查其类型来源与运行时依赖
- **THEN** 二者与 `getRenderScope()` 均从 `@xunserver-jsf/core/runtime` 导入，React 包不重新定义、不 deep import binding index，也不把含 writer 的 `ScopedFormInstance` 放入 Context

### Requirement: 折叠与 Tab 状态只来自 Core View state
Group/Layout binding 若呈现可折叠区域或 Tab，必须（MUST）以 Core `ViewSnapshot.collapsed`/`activeTab` 为唯一状态来源，并只通过 `setCollapsed(viewId, ...)`/`setActiveTab(viewId, ...)` 公开命令修改；不得（MUST NOT）以 React state 保存可与 Core 分叉的折叠/Tab 副本。Layout adapter 必须（MUST）在 preflight 时校验 tab key 属于其 layout 参数，非法 key 产生 adapter diagnostic 而不写入 Core。

#### Scenario: 折叠状态经 Core 往返
- **GIVEN** 一个 Group View 由可折叠面板呈现且当前 `collapsed: false`
- **WHEN** 用户点击折叠且随后 Core 通过 `reset()` 恢复默认值
- **THEN** 点击只调用 `setCollapsed(viewId, true)`，Accordion 状态跟随 snapshot；`reset()` 后重新展开，组件内不存在残留本地折叠状态

#### Scenario: 拒绝不属于 layout 的 tab key
- **GIVEN** Layout adapter 声明 tabs `["basic", "advanced"]`
- **WHEN** custom binding 尝试为该 View 提交 `setActiveTab(viewId, "other")`
- **THEN** adapter preflight 以 `source: "adapter"` diagnostic 拒绝并不调用 Core 命令，Core `activeTab` 与 `version` 不变

### Requirement: React hooks 精准桥接 Core external store
`@xunserver-jsf/react` 必须（SHALL）公开基于受支持 Core selector/subscription 的 readonly hooks，用于 Form、Field、View、Array order/item 和当前 binding snapshots。桥接必须（MUST）满足 React external-store 约束：`subscribe` identity 稳定且返回幂等 cleanup，`getSnapshot` 与 `getServerSnapshot` 在语义未变时返回同一引用，每个 consumer 只订阅显式 selector dependency；不得（MUST NOT）以整 Form clone、轮询或组件本地镜像代替 Core snapshot。

#### Scenario: 无关更新不重渲染叶节点
- **GIVEN** 两个 Field 组件分别订阅互不相交的 selector
- **WHEN** 其中一个 Field commit
- **THEN** 未受影响 selector 的 snapshot 保持引用相等，另一个 Field consumer 不因整表广播而重渲染

#### Scenario: render 间重复读取稳定
- **GIVEN** Core 没有新 commit 且 scope 与 selector 未替换
- **WHEN** React 在同一 committed version 多次调用 `getSnapshot`
- **THEN** 返回同一只读引用且不会生成新的订阅或派生副本

### Requirement: Widget 受 Core 控制并只发出语义交互
Field renderer 必须（MUST）把 Core canonical value、effective disabled/readonly/required 状态和 presentable validation snapshot 作为 Widget 的受控输入。Adapter 输出必须（MUST）先经 binding codec 归一化，再仅通过 `setValue`、`touch`、`focus`、`blur` 等受支持语义 closure 进入 Core command/transaction（`blur` closure 对应 Core `blur(viewId)`；因 Core `focus()` 非独占且 `blur()` 不隐式 touch，renderer 在 native focus 切换与 focused View 卸载时负责调用它，touch 时机由 renderer 策略决定）；native 或 React event、组件实例与 UI library model 不得（MUST NOT）进入 domain values 或 Runtime。

#### Scenario: 用户编辑通过事务回显
- **GIVEN** 一个 text Widget 显示 Core snapshot 中的 canonical value
- **WHEN** 用户产生合法 change、focus 与 blur 交互
- **THEN** renderer 调用对应语义 closure，受控值和交互状态只在 Core commit 后从新 snapshot 回显

#### Scenario: 程序化修改覆盖视图
- **GIVEN** Widget 已挂载且没有用户事件
- **WHEN** 应用通过公开 Runtime command 修改值或 effective state
- **THEN** selector 发布后 Widget 立即显示 Core 值与状态，不保留可分叉的业务本地副本

### Requirement: active、visible 与 validation presentation 由 Core 决定
Renderer 必须（MUST）只消费 Core 已解析的 effective active/visible/disabled/readonly 与 presentable validation snapshots，不得（MUST NOT）在 React 层重算 rule、activation、validation trigger 或 error policy。active 或 visible 导致节点不可呈现时，native subtree 必须（MUST）卸载，但其 values、Field/View state、errors 与数组身份的保留或清理完全遵循 Core 生命周期；再次可呈现时从当前 Core snapshot 恢复。

#### Scenario: hidden Field 卸载但状态保留
- **GIVEN** 一个已修改且 touched 的 Field 因 visible rule 变为 hidden
- **WHEN** renderer 卸载该 native subtree后又恢复 visible
- **THEN** Field 以 Core 保留的当前 value、dirty、touched 和 presentable errors 重新呈现

#### Scenario: inactive 与 hidden 不混为一谈
- **GIVEN** 两个节点分别为 inactive 和 active-but-hidden
- **WHEN** React 决定是否创建 native subtree
- **THEN** 两者都不呈现，但 renderer 不据此改变其 serialization、validation 或 state 生命周期语义

### Requirement: StrictMode 生命周期不泄漏订阅或副作用
React renderer、hooks、adapter mapper 与 custom render 输入准备必须（MUST）在 render phase 保持纯函数语义。React StrictMode 的开发期重复 render 和 setup-cleanup-setup 必须（MUST）产生平衡的 subscribe/unsubscribe，不重复注册 adapter、不执行 Core command，也不遗留 listener。

#### Scenario: StrictMode 重建订阅
- **GIVEN** renderer 在 React StrictMode 下挂载一个 Field consumer
- **WHEN** React 执行额外 setup、cleanup 与再次 setup
- **THEN** 任一时刻最多存在一个有效 listener，最终卸载后 listener 数为零，且没有额外 Runtime commit

### Requirement: SSR 与 hydration 使用一致的服务端快照
React renderer 必须（MUST）支持无 DOM 读取的服务端渲染，并为 external-store consumer 提供引用稳定的 `getServerSnapshot`。当服务端与客户端使用相同 immutable model、adapter、初始 committed semantic state 和渲染顺序时，首个客户端 snapshot 必须（MUST）与服务端输出一致；数组内部 identity 不得（MUST NOT）作为不稳定 DOM 文本泄漏。公开契约必须（MUST）说明等价初始状态是 hydration 前置条件，且不得用组件本地状态掩盖不一致输入。

#### Scenario: 相同初始状态成功 hydration
- **GIVEN** 服务端与客户端从同一 model、values、adapter 和 id prefix 建立初始实例
- **WHEN** 服务端渲染后客户端 hydrate 且期间没有业务 commit
- **THEN** 首次 markup 与 server snapshot 一致，hydration 后订阅后续 Core commit

#### Scenario: 服务端渲染不订阅
- **GIVEN** React 在服务端读取表单 snapshot
- **WHEN** 输出 HTML
- **THEN** 仅调用稳定 server snapshot reader，不创建 listener、不访问 DOM、不执行语义命令
