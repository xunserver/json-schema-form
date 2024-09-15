## Purpose

为 React Renderer 提供官方 MUI UIAdapter，把九种逻辑 Widget、布局、FieldChrome 和语义交互映射到 MUI，同时维持 Core canonical values、validation 真相与 accessibility 边界。

## Requirements

### Requirement: 官方 MUI adapter 完整提供四类角色
`@form/mui` 必须（SHALL）公开一个冻结且具有稳定 ID `mui` 的 `ReactUIAdapter`，组合 `FormAdapter`、`FieldChromeAdapter`、`WidgetAdapterRegistry` 与 `LayoutAdapterRegistry`。FormAdapter 必须（MUST）禁用浏览器约束验证，并不得（MUST NOT）把 MUI FormControl、组件 model、validation 状态或 DOM validity 当作业务 values、errors、validity 或 transaction 真相；表单提交只能调用 renderer 提供的 Core `submit()` 语义入口。

#### Scenario: MUI Form 不运行第二套验证
- **GIVEN** Core snapshot 含 errors 且浏览器原生 constraint 状态不同
- **WHEN** MUI Form 渲染并提交
- **THEN** 展示与 submit 结果只服从 Core validation/submit 状态，DOM/MUI 状态不注入业务错误

### Requirement: 九类内置逻辑 Widget 均有 binding
MUI Widget registry 必须（MUST）为 `text`、`textarea`、`number`、`select`、`multi-select`、`checkbox`、`switch`、`date` 与 `datetime` 提供确定 binding，并满足对应 Core `WidgetDefinition` 的 value、props、interaction 与 capability contract。缺失任一 binding 或 contract 不兼容必须（MUST）在 React renderer capability preflight 中诊断，不能静默替换控件。

#### Scenario: 默认 Widget 集合完整
- **GIVEN** resolved ViewTree 同时使用九种默认 logical Widget
- **WHEN** 选择 `mui` adapter 执行 preflight
- **THEN** 每个 logical key 唯一解析到兼容 binding 并可作为 controlled Widget 呈现

#### Scenario: custom logical Widget 必须显式扩展
- **GIVEN** 编译模型包含非默认 Widget key
- **WHEN** 所选 environment 没有对应 MUI/custom React binding
- **THEN** preflight 返回缺失 key diagnostic，而不降级为 `text`

### Requirement: Codec 保持 Core canonical value
每个 MUI binding 必须（MUST）确定地往返 Core canonical value：text/textarea 为 string，number 为有限 number 或 null，select 为允许的 JSON scalar/null，multi-select 为 readonly scalar array，checkbox/switch 为 boolean，date 为 `YYYY-MM-DD` string/null，datetime 为规范 RFC 3339 string/null。`Date`、`NaN`、native option object、React synthetic event、MUI component state 或 locale-dependent 文本不得（MUST NOT）进入 domain values；非法 output 必须（MUST）产生 adapter diagnostic 且不调用 `setValue`。

#### Scenario: 日期时间无时区漂移
- **GIVEN** Core values 分别含 `2026-09-15` 和带 offset 的 RFC 3339 datetime string
- **WHEN** MUI date/datetime binding 显示后未编辑地往返
- **THEN** Core 收到相同 canonical 语义，不出现 `Date`、locale 重格式化或隐式时区转换

#### Scenario: number 拒绝非有限值
- **GIVEN** MUI number control 产生空输入、有限数字或无法解码的 payload
- **WHEN** codec 归一化 output
- **THEN** 空输入按 contract 变为 null、有限数字被接受，`NaN`/Infinity/非法 payload 被诊断且不提交

### Requirement: Logical props 与 native props 不能覆盖 Core 所有权
MUI mapper 必须（MUST）从 logical Widget props、Field/View descriptor 与 `native["mui"]` 的冻结 options 生成只读 component props，并忽略其他 adapter namespace。Merge 后 Core-owned `value`/`checked`、disabled、readonly、required、presentable errors/status、IDs/ARIA relation，以及 change/input/focus/blur handlers 必须（MUST）拥有最终控制权；`defaultValue`/`defaultChecked`、替代受控值、替代 handler 或等价逃逸键不得（MUST NOT）由 logical/native props 注入。

#### Scenario: native options 尝试覆盖 value
- **GIVEN** `native["mui"]` 同时提供 `value`、`defaultValue` 与替代 `onChange`
- **WHEN** mapper 合并 props
- **THEN** adapter 在 native mount 前拒绝这些受保护键，且不覆盖 Core value 或 semantic handler

#### Scenario: 其他 namespace 被忽略
- **GIVEN** 同一 view 同时包含 `native["mui"]` 与 `native["element-plus"]`
- **WHEN** MUI mapper 处理配置
- **THEN** 只读取并验证 `mui` namespace，Element Plus options 不进入 MUI component

### Requirement: FieldChrome 统一 label、help、required、errors 与 ARIA
MUI `FieldChromeAdapter` 必须（MUST）从同一 Field/View 的 readonly presentation snapshot 呈现 label、help、required、validating 与 presentable errors，并生成确定的 label/help/error IDs。输入必须（MUST）通过 `aria-labelledby`/`aria-describedby`/`aria-invalid` 或等价语义与这些内容关联；同一 Field 的重复 View 必须（MUST）拥有独立 View-scoped DOM IDs 和 focus 状态，但共享 Field value/error source。Widget binding 不得（MUST NOT）复制 FieldChrome 内容。

#### Scenario: 多条 error 可访问呈现
- **GIVEN** 一个 Field 当前有 help text 和两条 presentable errors
- **WHEN** FieldChrome 与 Widget 渲染
- **THEN** 两条 error 均呈现，input 的描述关系包含 help/error IDs，`aria-invalid` 与 Core presentation 一致

#### Scenario: 重复 Field view 的 DOM ID 不冲突
- **GIVEN** resolved ViewTree 在两个位置引用同一 Field
- **WHEN** 两个 MUI FieldChrome 同时渲染
- **THEN** DOM IDs 和 focus binding 按 View scope 区分，value 与 validation source 仍共享该 Field

### Requirement: Object、Array、Group 与 Grid 布局保持语义分层
MUI Layout registry 必须（MUST）区分 Object/Array 数据容器与 Group/Grid 纯展示容器，并只按 resolved children、layout 参数和当前 `RenderScope` 组织 MUI layout primitives。Array 行必须（MUST）使用 React renderer 提供的 `ArrayItemId` key/binding；Layout 不得（MUST NOT）读取 values 推断 schema children、创建数组身份、执行规则或拥有 FieldChrome/Widget 的业务状态。

#### Scenario: 数组重排只改变布局次序
- **GIVEN** Array renderer 已渲染多个 MUI item layout
- **WHEN** Core move 更新 ArrayItemId order
- **THEN** Layout 按新次序排列相同 item binding，descendant Field/View 与 validation-owned state 继续跟随 ID

### Requirement: MUI 组件始终受控且交互语义化
所有内置 MUI binding 必须（MUST）从 Core snapshot 接收受控 value/state，并把 native change/focus/blur 归一为 React renderer 的 semantic interaction。Core 外部 commit、reset、rule effect、array command 或 server error变化必须（MUST）从新 snapshot 反映；MUI 组件不得（MUST NOT）保存可与 Core 分叉的业务 value/error副本，也不得直接访问 Form store 或数组内部命令。

#### Scenario: blur 更新 Core interaction
- **GIVEN** 用户编辑一个 text control 后 blur
- **WHEN** MUI binding 发出交互
- **THEN** 合法值、touch/focus/blur 通过受支持 Core 命令提交，错误是否展示由 Core policy snapshot 决定

#### Scenario: readonly 阻止写入但仍可呈现
- **GIVEN** Core effective snapshot 把一个 Field 标记为 readonly
- **WHEN** MUI Widget 渲染并收到 native 编辑尝试
- **THEN** control 呈现 readonly 语义且不调用 `setValue`，当前值与 presentable errors 仍可读取
