# array-identity-and-scopes Specification

## Purpose

为事务化 `FormInstance` 提供不依赖数组 index 的稳定 item 身份、原子结构命令与共享 Runtime 的 scoped facade，使动态数组和递归实例可安全复用静态模板、状态和精确订阅。

## Requirements

### Requirement: 数组 item 身份独立于 values 与当前位置
Runtime 必须（MUST）为每个可由静态 array template materialize 的现存 item 分配 opaque `ArrayItemId`，并在所属 `FormInstance` 生命周期内将其与当前 `InstancePath` 分开管理。ID 必须（MUST）在一次受支持的 move 前后保持稳定且在同一实例内唯一；它不得（MUST NOT）写入 business values、`CompiledFormModel` 或由业务字段值直接充当。两个 `FormInstance` 不得（MUST NOT）共享 array identity state。

#### Scenario: 初始化外层和嵌套数组身份
- **GIVEN** initial values 包含多个 list-array item，且部分 item 内还有嵌套数组
- **WHEN** Runtime 创建 `FormInstance` 并读取各层 array snapshot
- **THEN** 每个现存 item 都有唯一 `ArrayItemId` 和正确当前 `InstancePath`，而 `getValues()` 中不出现这些 ID

#### Scenario: move 改变地址但不改变身份
- **GIVEN** 一个 item 的 ID 为 `itemA`、当前位置为 `products[0]`
- **WHEN** 该 item 被 move 到 index 2
- **THEN** `itemA` 保持不变，其当前地址更新为 `products[2]`，且旧地址不再代表该逻辑 item

#### Scenario: 同一 Model 的实例不共享 ID
- **GIVEN** 两个 `FormInstance` 从同一 `CompiledFormModel` 和语义相同的 initial values 创建
- **WHEN** 分别读取两个实例的 array items
- **THEN** 两者拥有独立 identity/order state，任一实例的命令不能用其 ID 定位另一实例的 item

### Requirement: 动态实例只从静态模板 materialize
Runtime 必须（MUST）从 `CompiledFormModel` 已有的 list item、nested array 与 `RecursiveDataRef` 模板按实际 values 和命令按需 materialize instance binding，不得（MUST NOT）向 Model 添加节点或修改模板。合法 `ModelPath` 下缺失的 object container 可以（MAY）在 mutation 时 materialize；不存在的 array item 必须（MUST）通过 Array API 创建，不得通过越界 `InstancePath` 隐式产生。

#### Scenario: append materialize 嵌套模板
- **GIVEN** `orders[]` 的静态 item template 包含 `lines[]`
- **WHEN** append 一个含两条 line 的 order value
- **THEN** Runtime 为新 order 和两条 nested line 建立绑定与身份，所有实例节点仍引用既有静态模板

#### Scenario: 按需访问递归实例
- **GIVEN** 编译模型用有限 `RecursiveDataRef` 表示 tree child 模板，values 中存在多个有限深度 child
- **WHEN** 调用者逐层取得 scope
- **THEN** Runtime 只为现存深度 materialize binding，不重新 compile，也不向 `CompiledFormModel.nodes` 添加节点

#### Scenario: object container 与 array 越界边界不同
- **GIVEN** 一个静态合法 object property container 当前缺失，同时相邻 list array 当前长度为 1
- **WHEN** 分别写入 object descendant 和 `items[3].name`
- **THEN** object container 可以按模型建立，而数组写入以稳定 Runtime Diagnostic 失败且长度保持 1

### Requirement: ArrayInstance 提供完整且原子的 list 命令
`ArrayInstance` 必须（SHALL）提供 `append`、`insert`、`remove`、`move`、`setItemValue`、`replaceItem` 与 `clear`。每个调用必须（MUST）作为同一 Runtime 的声明式 command 参与一个 transaction；成功时全部 values、identity/order、state cleanup 与 selector invalidation 只 commit 一次，失败时全部回滚。`append`、`insert` 与 `replaceItem` 必须（MUST）返回新 item 的 `ArrayItemId`。

#### Scenario: append 与 insert 原子建立身份
- **GIVEN** 一个包含两个 item 的 list array
- **WHEN** 先 append 一个值并在另一次调用中向 index 1 insert 一个值
- **THEN** 每次调用都把 value 与新 ID 原子加入正确 order，并分别至多递增一次 Form version

#### Scenario: move 只重排现有 item
- **GIVEN** list array 中有多个稳定 ID
- **WHEN** 按 index 或属于该数组的 `ArrayItemId` 执行 move
- **THEN** 只有 order、聚合 array value 与受影响当前地址发生变化，不为任何被移动 item 创建新 ID

#### Scenario: clear 清空所有 item
- **GIVEN** list array 包含多个 item 和 nested array
- **WHEN** 调用 `clear()`
- **THEN** array value、全部 item order 与所有 descendant runtime state 在一次 commit 中清空

#### Scenario: 非法引用没有部分修改
- **GIVEN** 调用者提供越界 index、属于另一个 array 的 ID 或无效 move destination
- **WHEN** 执行任一 array command
- **THEN** 命令以包含 array path 和稳定 code 的 `source: "runtime"` Diagnostic 失败，values、identity、version 与订阅通知均不变化

#### Scenario: 固定 tuple 不伪装为 list
- **GIVEN** 目标是仅含位置绑定模板、没有可重复 list item template 的固定 tuple array
- **WHEN** 调用者执行 append、insert、remove、move 或 clear 等 list 结构命令
- **THEN** Runtime 返回明确的 unsupported-array-shape Diagnostic，而不猜测 tuple slot 的新模板或身份

### Requirement: item 更新与逻辑替换具有不同 identity 语义
`setItemValue` 必须（MUST）更新指定 item 的完整 business value并保留该 item 的 `ArrayItemId`；`replaceItem` 必须（MUST）把目标视为新逻辑 item、分配新 ID，并清理旧 item 的完整 Runtime subtree。`setItemValue` 引起的 nested whole-array replacement 必须（MUST）遵循 nested array 的 identity replacement policy，而不能让外层 ID 掩盖 descendant identity 变化。

#### Scenario: setItemValue 保留根 item identity
- **GIVEN** 一个 ID 为 `itemA` 的 product item
- **WHEN** 通过 `setItemValue(itemA, nextValue)` 修改其完整值
- **THEN** product 的 ID 仍为 `itemA`，其值和受影响 selector 在一次 commit 后更新

#### Scenario: replaceItem 建立新逻辑 item
- **GIVEN** index 1 当前由 `oldId` 标识并持有 descendant Field/View state
- **WHEN** 调用 `replaceItem(1, nextValue)`
- **THEN** 相同 index 由不同的新 ID 标识，旧 ID 的全部 descendant state 被清理，返回值是新 ID

#### Scenario: 更新外层 item 会重建被替换的 nested array
- **GIVEN** 外层 item 包含已有身份的 `lines` array
- **WHEN** `setItemValue` 保留外层 item ID 但有效替换其 `lines` business array
- **THEN** 外层 ID 保持稳定，而 `lines` 按 whole-array replacement policy reconcile 或重建其 item identity

### Requirement: whole-array replacement 与 reset 明确重建身份
通过 `setValue()` 或 `setValues()` 发生有效 whole-array replacement 时，Runtime 必须（MUST）默认为该数组全部 item 重建 identity并清理旧 subtree；语义等价的 value command 仍必须（MUST）作为 no-op 保留现有 ID。`reset()` 必须（MUST）恢复 initial values 和 source state，并为所有恢复出的 array item 重建 ID；只要实例含数组 item，这次 identity 变化就是一次有效 transaction，即使当前 business values 已等于 initial values。

#### Scenario: 默认 whole-array replacement 不猜测身份
- **GIVEN** 当前 array 与 next array 包含部分深度相等或业务 ID 相同的对象，但未配置 Identity Resolver
- **WHEN** whole-array value 发生有效替换
- **THEN** 所有旧 item ID 失效，next array 的每个 item 获得新 ID，Runtime 不按 index、深度相等或业务字段猜测复用

#### Scenario: 等价 setValue 保持 no-op
- **GIVEN** 调用者提交与当前 array 语义等价的 readonly value
- **WHEN** 执行 `setValue(arrayPath, sameValue)`
- **THEN** identity/order、version、snapshot 引用与订阅均保持不变

#### Scenario: reset 重建初始数组身份
- **GIVEN** `FormInstance` 的 initial values 含数组 item，且当前 values 已经与 initial values 相等
- **WHEN** 调用 `reset()`
- **THEN** 恢复出的 item 获得新 ID，旧 item scope 失效，所有变化只通过一次 commit/version 对外发布

### Requirement: 可选 Identity Resolver 只协调业务 key
Advanced Runtime 配置必须（SHALL）允许按 array `ModelPath` 提供 `ArrayIdentityResolver`，在有效 whole-array replacement 中以只读 item value 得到 `string`、`number` 或无 key，并对 old/new items 进行确定性 reconcile。唯一且相等的 defined key 必须（MUST）复用原 `ArrayItemId`，无 key 或仅出现在 next value 的 key 必须（MUST）获得新 ID；business key 不得（MUST NOT）作为 ID 本身公开。重复 key、不支持的返回值或 resolver 异常必须（MUST）在 commit 前产生结构化 Diagnostic 并回滚。

#### Scenario: 按唯一业务 key 保留身份
- **GIVEN** 为 `products[]` 配置 resolver，old 与 next array 中都有唯一 key `sku-1` 但 index 和其他字段不同
- **WHEN** whole-array replacement 成功
- **THEN** key 为 `sku-1` 的逻辑 item 保留原 `ArrayItemId`，只更新当前地址和值，新增 key 获得新 ID

#### Scenario: 无 key 的 item 不被猜测匹配
- **GIVEN** resolver 对一个 next item 返回无 key
- **WHEN** whole-array replacement 成功
- **THEN** 该 item 获得新 `ArrayItemId`，不会按 index 或深度相等复用旧 ID

#### Scenario: 歧义或 resolver 抛错会回滚
- **GIVEN** resolver 对同一 array 产生重复 defined key，或求值时抛出异常
- **WHEN** 尝试 whole-array replacement
- **THEN** Runtime 返回稳定 identity-resolver Diagnostic，且 values、所有 ID、state、version 与 subscriber 保持 commit 前状态

### Requirement: move 保留状态而删除清理整个 Runtime subtree
同一 item 的 move 必须（MUST）保留其全部 descendant Field、View 及后续 capability 所拥有的 instance state，并只更新当前位置 binding；它不得（MUST NOT）把未改变的 descendant value伪装成逐字段 value change。remove、clear、replace 或默认 whole-array replacement 必须（MUST）按被删除 `ArrayItemId` 清理整个 descendant Runtime subtree，包括 nested array identity、View state、selector binding cache 与 Validation-owned run token/state，并使旧 scope 永久失效。

#### Scenario: touched 和 focused 随 ID move
- **GIVEN** `itemA` 的 descendant Field 已 touched，某个 descendant View 已 focused
- **WHEN** `itemA` 从 index 0 move 到 index 2
- **THEN** 相同 state 可从 `itemA` 的新 scope 读取，旧 index 上的其他 item 不继承这些 state

#### Scenario: move 不产生虚假的 descendant value change
- **GIVEN** 分别订阅 array order、`itemA` 的 current path 和 `itemA.name` value
- **WHEN** 只 move `itemA` 且其 name 未变
- **THEN** order 与 current-path selector 更新，而 item-scoped name selector 保持稳定且不因 index 变化被当作 value 修改

#### Scenario: remove 清理后续 owner state 和 run token
- **GIVEN** 一个测试 owner 在 item subtree 内登记 state 与异步 run token
- **WHEN** 按该 item ID remove
- **THEN** cleanup 在同一 transaction 生命周期内覆盖全部 descendants，run token 被作废，旧 scope 或迟到结果不能写入新占用该 index 的 item

### Requirement: array 与 scope facade 共享唯一 Runtime
`FormInstance.array(path)` 必须（MUST）返回目标 array 的轻量 `ArrayInstance`，并允许按当前 index 或属于该 array 的 `ArrayItemId` 取得 item scope；`FormInstance.scope(path)` 与任意 nested scope 必须（MUST）返回轻量 `ScopedFormInstance`。所有 facade 必须（MUST）共享原 Form 的 Runtime、transaction queue、version、selector cache 和 diagnostics，且相对 path 必须（MUST）解析到当前 instance binding，而不是创建第二套 Store 或捕获会在 move 后过期的 index。

#### Scenario: index 与 ID 得到同一 item scope
- **GIVEN** 当前 index 1 对应 `itemB`
- **WHEN** 分别按 index 1 和 `itemB` 请求 item scope
- **THEN** 两个 facade 指向同一 runtime entity，并观察同一 values、Field/View state 和 Form version

#### Scenario: moved scope 动态解析当前位置
- **GIVEN** 调用者在 move 前持有按 `ArrayItemId` 创建的 item scope
- **WHEN** item 被 move 后通过该 scope 读取或提交相对 path command
- **THEN** 操作解析到该 ID 的新 `InstancePath`，不会修改原 index 当前的其他 item

#### Scenario: nested scope 不产生嵌套 Runtime
- **GIVEN** 从 item scope 再取得 object、nested array 或 recursive child scope
- **WHEN** nested facade 提交 mutation并订阅 selector
- **THEN** mutation进入根 Form 的同一 transaction且只增加同一个 version，订阅使用同一 committed snapshot

#### Scenario: 已删除 scope 不会重新绑定 index
- **GIVEN** 调用者持有随后被 remove 或 reset 作废的 item scope
- **WHEN** 再通过该 scope 读取或 mutation
- **THEN** Runtime 返回 stale-scope Diagnostic，且该 facade 不会绑定到后来位于相同 index 的新 item

### Requirement: 数组 selector 精确发布 readonly identity 与 binding snapshot
Advanced Runtime API 必须（SHALL）提供 readonly array order/item/current-binding selector，使 Framework binding 和高级消费者可用 `ArrayItemId` 作为稳定 key。未受 transaction 影响的 array 或 item selector 必须（MUST）保持引用稳定且不重新求值；任何公开 snapshot 不得（MUST NOT）暴露可变 order、Store、内部 binding key 或 `RuntimeNodeId`。

#### Scenario: sibling array mutation 不通知目标 selector
- **GIVEN** 分别订阅两个 sibling array 的 order selector
- **WHEN** 只 append 第一个 array
- **THEN** 第一个 selector 发布新的 readonly order，第二个 selector 不重新求值也不通知

#### Scenario: snapshot 不能绕过 Array API
- **GIVEN** 调用者取得 array order 和 item binding snapshot
- **WHEN** 尝试改写 order、ID 或当前 path
- **THEN** 公共类型与运行时只读边界拒绝该修改，Form values、identity 和 version 均不变化

### Requirement: 后续能力复用受限的 binding 与 subtree lifecycle
Runtime 必须（SHALL）为 Rule/Schema Dynamics、Validation 和 Renderer integration 提供同一 transaction 所拥有的只读 instance binding、move readdress 与 subtree removal lifecycle contract。后续 owner 可以（MAY）据此关联自有 readonly/source namespace、取消 run token 或订阅 order，但不得（MUST NOT）取得 mutable Array Store、生成/替换 ID、绕过 command/transaction 写 values，或将 `active`、`visible`、validation result 与 array identity 混为同一状态。

#### Scenario: Validation probe 复用稳定 binding
- **GIVEN** 测试 Validation owner 按 runtime entity 登记结果与 run token
- **WHEN** item move 后又被 remove
- **THEN** move 仅 readdress 同一 owner state，remove lifecycle 精确作废该 subtree 的结果和 token，整个过程不公开 Validation 产品 API

#### Scenario: Renderer probe 只能读取 identity/order
- **GIVEN** Framework binding 通过受支持 selector 读取 array order 和 item scopes
- **WHEN** 它使用 `ArrayItemId` 作为 key 并尝试取得内部 writer
- **THEN** 只读 binding 足以保持 move 后组件身份，而 mutable Store、cleanup writer 与 `RuntimeNodeId` 不可获得

#### Scenario: 本 change 不执行后续业务语义
- **GIVEN** Model 含 conditional、Rule 与 Validation metadata
- **WHEN** 仅交付本 capability 的实现执行 array commands
- **THEN** Runtime 不自行求值 active/visible、Rule 或 validation，不新增 `validate()`、`submit()`、`applyErrors()`、`serialize()` 或 Renderer API
