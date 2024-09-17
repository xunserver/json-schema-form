# shadcn-ui-adapter Specification

## Purpose

为 React Renderer 提供官方 shadcn/ui UIAdapter：通过消费方注入的组件 slot 映射九种逻辑 Widget、布局、FieldChrome 与语义交互，同时维持 Core canonical values、validation 真相与 accessibility 边界，且不在产品包内 vendor shadcn 源码。

## Requirements

### Requirement: 官方 shadcn adapter 通过注入组件提供四类角色
`@xunserver-jsf/shadcn` 必须（SHALL）公开 `createShadcnAdapter({ components })`，返回冻结且具有稳定 ID `shadcn` 的 `ReactUIAdapter`，组合 FormAdapter、FieldChromeAdapter、WidgetAdapterRegistry 与 LayoutAdapterRegistry。Adapter 不得（MUST NOT）在产品包内拷贝或发布 shadcn UI 源码，也不得（MUST NOT）默认导出无需注入即可使用的单例 adapter。FormAdapter 必须（MUST）只作为结构/样式容器（`noValidate`），不得（MUST NOT）把 UI library form model、validation 或 DOM validity 当作业务 values、errors 或 transaction 真相。

#### Scenario: 缺 slot 时 fail closed
- **GIVEN** 调用 `createShadcnAdapter` 时缺少必需组件 slot
- **WHEN** factory 执行
- **THEN** 抛出或返回结构化 adapter diagnostic，且不产生可挂载的部分 adapter

#### Scenario: Form wrapper 不接管 Core 状态
- **GIVEN** FormRenderer 使用 `shadcn` adapter 且 Core snapshot 已有 values/errors
- **WHEN** FormAdapter 创建容器并提交
- **THEN** 显示与提交状态仍来自 Core snapshots/commands

### Requirement: 九类内置逻辑 Widget 均有 binding
Widget registry 必须（MUST）为 `text`、`textarea`、`number`、`select`、`multi-select`、`checkbox`、`switch`、`date` 与 `datetime` 提供确定 binding。date/datetime 必须（MUST）保持 canonical 字符串，不得（MUST NOT）把 `Date` 或 dayjs/date-fns 对象写入 domain values。

#### Scenario: 默认 Widget 集合完整
- **GIVEN** 已注入全部必需组件 slot 且 resolved ViewTree 同时使用九种默认 logical Widget
- **WHEN** 选择 `shadcn` adapter 执行 preflight
- **THEN** 每个 logical key 唯一解析到兼容 binding

### Requirement: Codec 保持 Core canonical value
每个 binding 必须（MUST）确定地往返 Core canonical value：text/textarea 为 string，number 为有限 number 或 null，select 为允许的 JSON scalar/null，multi-select 为 readonly scalar array，checkbox/switch 为 boolean，date 为 `YYYY-MM-DD` string/null，datetime 为规范 RFC 3339 string/null。非法 output 必须（MUST）产生 adapter diagnostic 且不调用 `setValue`。

#### Scenario: number 拒绝非有限值
- **GIVEN** number control 产生空输入、有限数字或无法解码的 payload
- **WHEN** codec 归一化 output
- **THEN** 空输入按 contract 变为 null、有限数字被接受，`NaN`/Infinity/非法 payload 被诊断且不提交

### Requirement: props 与 native mapper 保护 Core-owned 键
mapper 必须（MUST）只读取 `native["shadcn"]`，并保护 value/disabled/ARIA/handler 等 Core-owned 键；其他 adapter namespace 必须（MUST）被忽略。

#### Scenario: 其他 namespace 被忽略
- **GIVEN** 同一 Field 含 `shadcn` 与其他 adapter native options
- **WHEN** mapper 合并 props
- **THEN** 只读取前者的非保留 options

#### Scenario: native 尝试覆盖 value
- **GIVEN** `native["shadcn"]` 提供 `value` 或替代 `onChange`
- **WHEN** mapper 合并 props
- **THEN** adapter 在 native mount 前拒绝这些受保护键

### Requirement: FieldChrome 统一 label、help、required、errors 与 ARIA
FieldChrome 必须（MUST）从 readonly presentation snapshot 呈现 label、help、required、validating 与 presentable errors，使用注入的 Field 系列组件，并在 Field 上设置 `data-invalid`、在控件上设置 `aria-invalid`；label/help/error DOM IDs 必须（MUST）来自 renderer。

#### Scenario: 多条 error 可访问呈现
- **GIVEN** 一个 Field 当前有 help text 和两条 presentable errors
- **WHEN** FieldChrome 与 Widget 渲染
- **THEN** 两条 error 均呈现，input 的描述关系包含 help/error IDs，`aria-invalid` 与 Core presentation 一致

### Requirement: Object、Array、Group 与 Grid 布局保持语义分层
Layout registry 必须（MUST）区分 Object/Array 数据容器与 Group/Grid 纯展示容器。内置 Group 必须（MUST）以注入的 Card 呈现为始终展开的分组盒子，不得（MUST NOT）提供折叠控件，也不得（MUST NOT）持有本地折叠状态。

#### Scenario: Group 以卡片呈现且始终展开
- **GIVEN** Group View 由 Card 呈现
- **WHEN** 渲染该 Group
- **THEN** 子节点始终可见，界面上不出现折叠触发器

### Requirement: 组件始终受控且交互语义化
所有内置 binding 必须（MUST）从 Core snapshot 接收受控 value/state，并把 change/focus/blur 归一为 semantic interaction；不得（MUST NOT）保存可与 Core 分叉的业务 value/error 副本。

#### Scenario: blur 更新 Core interaction
- **GIVEN** 用户编辑 text control 后 blur
- **WHEN** binding 发出交互
- **THEN** 合法值与 focus/blur 经受支持 Core 命令提交
