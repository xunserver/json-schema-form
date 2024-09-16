# arco-react-ui-adapter Specification

## Purpose

为 React Renderer 提供官方 Arco Design React UIAdapter，把九种逻辑 Widget、布局、FieldChrome 和语义交互映射到 Arco Design React，同时维持 Core canonical values、validation 真相与 accessibility 边界。

## Requirements

### Requirement: 官方 Arco Design React adapter 完整提供四类角色
`@form/arco-react` 必须（SHALL）公开一个冻结且具有稳定 ID `arco-react` 的 UIAdapter，组合 FormAdapter、FieldChromeAdapter、WidgetAdapterRegistry 与 LayoutAdapterRegistry。FormAdapter 必须（MUST）只作为结构/样式容器，不得（MUST NOT）把 UI library form model、validation 或 DOM validity 当作业务 values、errors 或 transaction 真相。

#### Scenario: Form wrapper 不接管 Core 状态
- **GIVEN** FormRenderer 使用 `arco-react` adapter 且 Core snapshot 已有 values/errors
- **WHEN** FormAdapter 创建容器并提交
- **THEN** 显示与提交状态仍来自 Core snapshots/commands

### Requirement: 九类内置逻辑 Widget 均有 binding
Widget registry 必须（MUST）为 `text`、`textarea`、`number`、`select`、`multi-select`、`checkbox`、`switch`、`date` 与 `datetime` 提供确定 binding。date/datetime 必须（MUST）保持 canonical 字符串，不得（MUST NOT）把 `Date` 或 dayjs/date-fns 对象写入 domain values。

#### Scenario: 默认 Widget 集合完整
- **GIVEN** resolved ViewTree 同时使用九种默认 logical Widget
- **WHEN** 选择 `arco-react` adapter 执行 preflight
- **THEN** 每个 logical key 唯一解析到兼容 binding

### Requirement: props 与 native mapper 保护 Core-owned 键
mapper 必须（MUST）只读取 `native["arco-react"]`，并保护 value/disabled/ARIA/handler 等 Core-owned 键。

#### Scenario: 其他 namespace 被忽略
- **GIVEN** 同一 Field 含 `arco-react` 与其他 adapter native options
- **WHEN** mapper 合并 props
- **THEN** 只读取前者的非保留 options
