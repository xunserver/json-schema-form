## Purpose

定义 React 专属 UI adapter 的组合、选择、冻结、能力验证和诊断协议，使渲染扩展可组合但不能污染 Core 环境、绕过事务或获得可变 Runtime 权限。

## Requirements

### Requirement: RendererEnvironment 与 FormEnvironment 严格分离
`@form/react` 必须（SHALL）提供 `ReactRendererEnvironment` 与 `ReactUIAdapter` 公开契约。Renderer environment 只能保存 React component binding、props mapper、codec、interaction 和 layout/chrome 能力；不得（MUST NOT）注册或替代 `FormEnvironment` 中的 Schema/Widget Definition、Rule、Validator、Serializer 或 Compiler plugin。两类环境即使使用相同 logical key 也必须（MUST）保持不同类型与构建生命周期。

#### Scenario: Renderer adapter 不能注册 Core plugin
- **GIVEN** 一个 React adapter 声明与 logical Widget key 对应的 binding
- **WHEN** 构建 renderer environment
- **THEN** binding 只参与 render-time resolution，不能改变已编译 `WidgetDefinition` 或 Core registry

### Requirement: Adapter 明确组合四类角色
每个 `ReactUIAdapter` 必须（MUST）具有稳定 ID 和协议版本，并明确提供 `FormAdapter`、`FieldChromeAdapter`、`WidgetAdapterRegistry`、`LayoutAdapterRegistry` 四类角色。`FormRenderer` 必须（MUST）支持直接传入单个冻结 adapter 的简化入口，以及通过冻结 environment 和 adapter ID 选择组合结果的高级入口；两种入口的行为契约必须（MUST）一致。

#### Scenario: 简化与高级入口等价
- **GIVEN** 同一个冻结 adapter 同时可直接使用并已注册到 environment
- **WHEN** 两个 `FormRenderer` 分别使用简化入口和其 adapter ID
- **THEN** 四类 role resolution、capabilities、diagnostics 与受控交互行为等价

#### Scenario: adapter ID 不存在
- **GIVEN** advanced入口请求一个未注册 adapter ID
- **WHEN** renderer preflight
- **THEN** 在创建 UI library subtree 前抛出结构化 adapter diagnostic，且 Core state/version 不变

### Requirement: Environment 采用 validate-then-publish 冻结构建
React renderer environment 必须（MUST）通过显式 builder/definition helper 收集输入、完整验证后一次发布冻结只读 facade。发布后的 adapter、role registry、binding descriptor、capability 集合和 native option schema 必须（MUST）保持稳定 identity，调用者不得（MUST NOT）取得 mutable `Map`、在 render 时注册 binding 或修改已发布项。

#### Scenario: 构建失败不发布半成品
- **GIVEN** environment 输入包含一个无 codec 的 Widget binding
- **WHEN** builder 执行验证
- **THEN** 构建失败且不返回部分 environment，不会污染此前已发布实例

#### Scenario: 发布后不可变
- **GIVEN** 一个成功构建的 environment
- **WHEN** 调用者尝试修改 registry 或 binding options
- **THEN** 只读 facade 不暴露写入口，后续 render 仍使用原冻结内容

### Requirement: 冲突默认失败且 override 精确可审计
同一 registry 中重复 adapter ID、Widget key、Layout key 或 role ownership 必须（MUST）默认失败。覆盖必须（MUST）使用精确 override，至少声明 adapter ID、registry/role、key、expected owner 与 replacement owner；owner 不匹配、通配覆盖或依赖注册顺序的 last-write-wins 必须（MUST）失败并产生结构化诊断。

#### Scenario: 未声明的重复 binding 失败
- **GIVEN** 两个扩展都注册同一 adapter 的 `text` binding
- **WHEN** environment 组合它们且没有 override
- **THEN** 构建失败并报告双方 owner 与冲突 key

#### Scenario: 精确 override 成功
- **GIVEN** override 的 adapter、registry、key 与 expected owner 均匹配现有项
- **WHEN** 构建 environment
- **THEN** 只替换该项并保留可审计 provenance，其他 binding 不变

### Requirement: Capability preflight 在 native mount 前失败
Renderer 必须（MUST）从最终 ViewTree 和选定 adapter 收集所需 Widget、Layout、codec、interaction、readonly/disabled/multiple 与 accessibility capabilities，并在创建 UI library native subtree 前一次性 preflight。缺失或不兼容能力不得（MUST NOT）通过相邻 Widget、原生 HTML 或默认 adapter 静默降级；失败必须（MUST）产生含 adapter ID、logical key、View/ModelPath 与 provenance 的结构化 diagnostic，但不得包含业务 values、native event、内部 Runtime ID 或未清理 cause。

#### Scenario: Widget capability 不足
- **GIVEN** 一个 view 要求 `multiple`，所选 binding 未声明支持
- **WHEN** Form renderer preflight
- **THEN** 渲染在 native mount 前失败，diagnostic 指向该 adapter、Widget 与 view，且没有 Core commit

### Requirement: Custom render 逃逸口保持最小权限
Framework-specific custom render 必须（MUST）只接收冻结 descriptor、所需 readonly snapshots、当前 `RenderScope`/`InstanceBinding` 和受限 semantic interaction closures。它不得（MUST NOT）接收 `FormInstance`、Store writer、mutable registry、Compiler context、native event passthrough 或其他 UI framework 协议；custom entry 必须（MUST）声明并通过与标准 binding 相同的 logical capability preflight。

#### Scenario: custom Widget 使用语义 closure
- **GIVEN** 一个 custom React binding 通过 preflight
- **WHEN** 它提交合法 canonical value
- **THEN** 只能调用提供的 semantic closure，不能直接写 Value/Field/View store

#### Scenario: custom render 抛错
- **GIVEN** custom render 或 mapper 在创建 React element 前抛错
- **WHEN** renderer 处理失败
- **THEN** 暴露经清理且可定位的 adapter diagnostic，Core values、version 与订阅图不变
