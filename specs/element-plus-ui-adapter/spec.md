# element-plus-ui-adapter Specification

## Purpose

为 Vue Renderer 提供生产可用的 Element Plus UIAdapter，把 Core 逻辑 Widget、布局、effective state 与 presentable validation 映射为受控组件，同时保持 canonical values、事务命令和 accessibility 契约。

## Requirements

### Requirement: Element Plus Adapter 完整提供四类角色
`@xunserver-jsf/element-plus` 必须（SHALL）公开一个冻结且具有稳定 ID `element-plus` 的 VueUIAdapter，组合 FormAdapter、FieldChromeAdapter、WidgetAdapterRegistry 与 LayoutAdapterRegistry。FormAdapter 可以（MAY）使用 Element Plus Form 作为结构/样式容器，但不得（MUST NOT）把其 model、rules、validate、resetFields 或 error store 当作业务 values、validation 或 transaction 真相。

#### Scenario: Form wrapper 不接管 Core 状态
- **GIVEN** FormRenderer 使用 Element Plus adapter且 Core snapshot已有 values/errors
- **WHEN** FormAdapter 创建 `el-form` 容器
- **THEN** 所有显示和提交状态仍来自 Core snapshots/commands，adapter不调用 Element Plus validation来产生或清除 Core errors

### Requirement: 九类内置逻辑 Widget 均有 binding
WidgetAdapterRegistry 必须（MUST）为 `text`、`textarea`、`number`、`select`、`multi-select`、`checkbox`、`switch`、`date` 与 `datetime` 提供确定 binding，并满足对应 Core `WidgetDefinition` 的 value、props、interaction 与 capability contract。缺失任一内置 binding 或逻辑 contract 不兼容必须（MUST）在 Renderer capability preflight 中诊断，不能静默替换为另一控件。

#### Scenario: 内置 Widget capability 完整
- **GIVEN** 一个 resolved ViewTree 同时使用九类默认 logical Widget
- **WHEN** 使用标准 Element Plus adapter执行 preflight
- **THEN** 每个 key 都解析到唯一 compatible binding并可受控呈现，无 Schema-based fallback

#### Scenario: custom logical Widget 需显式注册
- **GIVEN** FieldDescriptor 引用 `company.currency` 且标准 adapter没有该 key
- **WHEN** 未组合 custom binding就呈现
- **THEN** Renderer报告 missing capability；只有显式 Vue adapter extension/custom render才能满足，Element Plus adapter不按 value shape 猜测

### Requirement: Value codec 保持 canonical domain values
每个 binding 必须（MUST）把 Core canonical value 确定映射为 native controlled prop，并把 UI output 解码回该 Widget 的 canonical contract：text/textarea 为 string，number 为有限 number 或 null，select 为允许的 JSON scalar/null，multi-select 为 readonly scalar array，checkbox/switch 为 boolean，date 为 `YYYY-MM-DD` string/null，datetime 为规范化 RFC 3339 string/null。`Date`、`NaN`、native option object、synthetic/native event 或 Element Plus internal model 不得（MUST NOT）进入 domain values；无效 output 必须（MUST）产生 adapter diagnostic且不调用 `setValue`。

#### Scenario: date 不把 Date 写入 values
- **GIVEN** Core date value是 `2026-09-15` 且 Element Plus DatePicker产生其 native output
- **WHEN** codec完成 encode/decode
- **THEN** 受控显示往返为相同 canonical date string，Core values中不出现 `Date` 或时区漂移值

#### Scenario: number 拒绝非有限输出
- **GIVEN** native number control产生 `NaN` 或无法解码的 payload
- **WHEN** binding处理 change
- **THEN** adapter报告稳定 codec diagnostic并保持当前 Core value/version不变

### Requirement: props 与 native mapper 保护 Core-owned 键
Element Plus mapper 必须（MUST）从逻辑 Widget props、Field/View descriptor 及 `native["element-plus"]` 的冻结 options 产生只读 native props。Merge 必须（MUST）使 Core-owned `modelValue`/value、disabled、readonly、presentable errors/status、ARIA IDs 及 `onUpdate:modelValue`/change/focus/blur semantic handlers 始终具有最终控制权；`value`、`errors` 等通用保留键以及上述 Element Plus 等价键不得（MUST NOT）由 props/native 覆盖、删除或注入替代 handler。其他 adapter namespace 必须（MUST）被忽略。

#### Scenario: native options 不能夺取受控值
- **GIVEN** opaque native options尝试提供 `modelValue` 或 `onUpdate:modelValue`
- **WHEN** mapper合成 Element Plus props
- **THEN** 产生可定位 adapter diagnostic且恶意值/handler不生效，唯一写路径仍是 codec后的semantic command

#### Scenario: adapter namespace 隔离
- **GIVEN** 同一 Field含 `element-plus` 与 `antd` native options
- **WHEN** Element Plus mapper运行
- **THEN** 只读取前者的非保留 options，不解释或转发 `antd` payload

### Requirement: FieldChrome 呈现语义与无障碍关系
FieldChromeAdapter 必须（MUST）从 resolved Field/View metadata及Core effective/presentation snapshots呈现 label、help、required indicator、validating state与 presentable errors，并为 native control建立确定的 label/error/help ID、`aria-labelledby`/`aria-describedby`、`aria-invalid`、`aria-required` 及适用 disabled/readonly语义。它不得（MUST NOT）从 Schema、raw error source或 Element Plus rules自行重算 required、error eligibility或validity。

#### Scenario: presentable error 与 control 关联
- **GIVEN** Core presentation selector为一个 Field返回两条可展示 error和help text
- **WHEN** FieldChrome呈现 native control
- **THEN** 两条 error按 Core顺序显示，control的描述关系同时引用help/error IDs并声明 invalid

#### Scenario: hidden field 不留下失效 ARIA target
- **GIVEN** Field effective visible变为false并默认卸载
- **WHEN** Renderer更新 DOM
- **THEN** native control、label/help/error DOM共同卸载，而 Core value/errors/touched保持不变

### Requirement: Object、Array、Group 与 Grid 布局保持 View 语义
LayoutAdapterRegistry 必须（MUST）分别支持绑定数据 scope 的 Object/Array container 与纯 presentation Group/Grid，不得（MUST NOT）把 ObjectView等同于Group或把ArrayView等同于任意repeat layout。Grid 必须（MUST）只消费已编译的 framework-neutral layout参数；Array child必须（MUST）由 Vue Renderer提供当前 item scopes/`ArrayItemId` keys，Layout adapter不得生成身份、写 order或直接执行数组变更。

#### Scenario: Object 与 Group 不交换职责
- **GIVEN** ViewTree含一个 ObjectView和其内的 presentation Group
- **WHEN** Element Plus layout bindings呈现
- **THEN** Object建立数据 scope边界，Group只组织视觉结构，二者不查询 Schema猜测 children

#### Scenario: Grid 使用已解析参数
- **GIVEN** GridView含编译后的 columns/gap/span等 framework-neutral参数
- **WHEN** adapter映射 Element Plus layout
- **THEN** 输出遵循这些参数及确定child顺序，不重读原始 layout DSL或补 `remaining-fields`

### Requirement: Element Plus 交互保持受控和事务化
所有内置 binding 必须（MUST）把 native update/change/focus/blur 归一为 Vue Renderer semantic interaction，并由 Core command/transaction提交。Core 外部 commit、reset、rule effect、array move或server error变化必须（MUST）反映到 controlled props；binding不得（MUST NOT）保留可与 Core 分叉的业务 value/error副本，也不得调用数组内部或 Form store API绕过命令。

#### Scenario: 外部 commit 覆盖 native 显示
- **GIVEN** Widget已挂载且 Form通过受支持 Runtime command改变其value/disabled状态
- **WHEN** 对应selector发布新snapshot
- **THEN** Element Plus controlled props更新为该snapshot，不以组件内部旧值反向覆盖 Core

#### Scenario: native interaction 只产生 semantic action
- **GIVEN** 用户编辑并 blur一个 text control
- **WHEN** binding处理 Element Plus emits
- **THEN** 它按策略发出 decoded `setValue`、`touch`、`focus`/`blur`，不把native event对象传入Definition、Core或domain values

### Requirement: readonly 与 disabled 阻止写入
标准 Element Plus Widget binding 必须（MUST）在 effective `readonly` 或 `disabled` 时拒绝 codec 写入：`applyCodecChange`（或等价路径）不得（MUST NOT）调用 `setValue`。对不尊重 native `readonly` 的控件（select、checkbox、switch 等），必须（MUST）将 native `disabled` 设为 `disabled || readonly`，或提供同等不可编辑表现。

#### Scenario: readonly 文本不写入
- **GIVEN** Field effective `readonly: true`
- **WHEN** native 发出 `onUpdate:modelValue`
- **THEN** Core values 与 version 不变

#### Scenario: readonly select 不可编辑且不写入
- **GIVEN** select Field effective `readonly: true`
- **WHEN** 渲染并尝试更新 modelValue
- **THEN** 控件以 disabled 表现，且 Core 不被写入

### Requirement: FieldChrome 单一可见 label
Element Plus FieldChrome 必须（MUST）为 label 提供恰好一份可见呈现，并保留稳定 `ids.label` 供控件 `aria-labelledby`；不得（MUST NOT）同时通过 `ElFormItem` label prop 与额外可见文本节点重复显示同一 label。

#### Scenario: 单 label 与 ARIA
- **GIVEN** Field 有 display label
- **WHEN** 渲染 FieldChrome
- **THEN** 页面上该 label 只出现一次，且 control 的 `aria-labelledby` 指向 `ids.label`
