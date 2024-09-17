# visual-schema-editor Specification

## Purpose

为不熟悉 JSON Schema 与 UI Schema 细节的使用者提供一个可测试、可访问的可视化 Form Definition authoring 工作台，并保证拖拽配置、文本工作台、现有编译诊断、多适配器预览与导出产物之间保持确定且不丢失的边界。

## Requirements

### Requirement: 可视化编辑器提供三列 authoring 工作区
Playground 必须（SHALL）提供与现有 JSON 文本工作台并存的可视化编辑模式。该模式必须（MUST）同时呈现左侧组件面板、中间设计画布和右侧属性检查器；选择画布节点时，属性检查器必须（MUST）显示该节点的可编辑配置与定位信息，不得把编译状态或 `FormInstance` 状态混入 authoring 属性。

#### Scenario: 打开可视化编辑模式
- **GIVEN** 用户已在 playground 打开一个可被可视化子集表示的 workbench 文档
- **WHEN** 用户切换到可视化编辑模式
- **THEN** 页面显示组件面板、设计画布和属性检查器，画布表达当前 Schema/UI Schema 的 authoring 结构

#### Scenario: 选择画布节点进行配置
- **GIVEN** 画布中已有字段或 layout 节点
- **WHEN** 用户选择该节点
- **THEN** 属性检查器显示该节点的字段或 layout 配置，并且不显示或修改 Runtime values、touched、errors 等实例状态

### Requirement: 首版组件目录覆盖常用 scalar 字段与 layout
组件面板必须（MUST）至少提供 text、textarea、number、boolean、select 字段，以及 group、纵向、横向和 grid layout。字段必须（MUST）生成 Draft 2020-12 root object property 和对应 `UISchema.fields`/field layout 引用；layout 只能（MUST）改变呈现组织，不得把 presentation group 伪装成数据 Object。首版不得（MUST NOT）宣称支持任意 Object/Array authoring 或全部 JSON Schema 关键字。

#### Scenario: 添加常用字段
- **GIVEN** 一个空的可视化 root object 文档
- **WHEN** 用户分别添加 text、number、boolean 与 select 字段并填写合法属性
- **THEN** 生成的 Schema properties 分别保留相应 scalar 类型、约束和 enum，UI Schema 使用对应逻辑 Widget 与 `ModelPath`

#### Scenario: 添加 presentation layout
- **GIVEN** 画布中已有多个 scalar 字段
- **WHEN** 用户使用 group、纵向、横向或 grid 节点组织字段
- **THEN** 生成的 UI Schema layout 反映该组织与列/span 配置，而 JSON Schema 的数据 property 层级保持不变

### Requirement: 拖拽与等价命令安全地添加、嵌套和重排节点
用户必须（MUST）能够把组件从面板加入画布、把字段或 layout 放入合法容器，并在同一或不同合法容器间重排。每次成功移动必须（MUST）保留节点全部配置和当前选择；循环嵌套、字段承载 children、越界位置或其他非法目标必须（MUST）被拒绝并保持文档不变。所有拖拽结果必须（MUST）存在键盘可完成的等价操作。

#### Scenario: 将字段拖入 grid 并重排
- **GIVEN** 画布包含一个 grid layout 和两个已配置字段
- **WHEN** 用户把两个字段依次移入 grid 并调整顺序
- **THEN** 画布、生成的 layout children 顺序和后续导出顺序一致，两个字段原有配置均被保留

#### Scenario: 拒绝非法嵌套
- **GIVEN** 画布包含嵌套 layout 与一个字段叶节点
- **WHEN** 用户尝试把父 layout 放入其后代或把其他节点放入字段
- **THEN** 操作被拒绝、authoring 文档保持不变，并向用户说明目标不接受该节点

#### Scenario: 键盘完成等价重排
- **GIVEN** 用户无法使用指针拖拽且焦点位于一个画布节点
- **WHEN** 用户通过键盘命令进入移动模式、选择合法目标并确认
- **THEN** 产生与对应拖拽相同的文档变更，并通过可感知状态或 live announcement 报告结果

### Requirement: 属性检查器只提交合法且一致的字段配置
属性检查器必须（MUST）支持字段 key、title、description、required、default、选项和逻辑 Widget，以及 layout 的 columns 与 span 等当前节点适用配置。字段 key 必须（MUST）在 root object 内唯一并能无歧义形成 canonical `ModelPath`；required 必须（MUST）写入 owning Object 的 JSON Schema `required`，不得写入 `FieldUI`。不兼容 default、重复 key、空 select 选项、无效 columns/span 或不兼容 Widget 必须（MUST）产生可定位诊断，并且不得提交部分变更。

#### Scenario: 配置 required select 字段
- **GIVEN** 用户选择一个 select 字段
- **WHEN** 用户设置唯一 key、标题、非空选项、合法 default 并启用 required
- **THEN** Schema property 包含 enum/default，root object 的 `required` 包含该 key，`UISchema.fields` 使用 select Widget

#### Scenario: 重复 key 不产生部分更新
- **GIVEN** root object 已存在 key 为 `country` 的字段
- **WHEN** 用户尝试把另一字段 key 改为 `country`
- **THEN** 检查器显示定位到该字段与 key 的诊断，Schema、UI Schema、layout 和最近成功预览均保持修改前状态

#### Scenario: required 与 visible 保持不同语义
- **GIVEN** 用户把一个字段设为 required，并另外配置受支持的初始 visible 表现
- **WHEN** 文档被导出并编译
- **THEN** required 只来自 JSON Schema Object edge，visible 只来自 UI 表现配置，两者不得互相替代

### Requirement: 可视化文档确定性生成并同步 workbench 文档
同一可视化 authoring 文档必须（MUST）确定性生成格式化的 `schemaText` 与 `uiSchemaText`，稳定保留画布声明顺序，并保持 `rulesText`、`configText` 与 `formDataText` 不变。可视化编辑只可（MUST）修改 Definition 输入，不得修改 `CompiledFormModel`、`FormInstance`、Runtime values 或预览 Adapter 状态。切回文本模式时必须（MUST）立即看到同一份已生成文档。

#### Scenario: 可视化修改同步到文本工作台
- **GIVEN** workbench 具有既有 rules、config 与 formData 文本
- **WHEN** 用户在画布新增字段并切回 Monaco 的 schema 与 uiSchema 标签
- **THEN** Monaco 显示确定性格式化的新 Schema/UI Schema，而 rules、config 与 formData 文本逐字保持不变

#### Scenario: 重复生成结果稳定
- **GIVEN** 一份内容与顺序均未改变的可视化 authoring 文档
- **WHEN** 系统多次生成 workbench 文档或在可视化与文本模式间切换
- **THEN** `schemaText` 与 `uiSchemaText` 字节结果稳定，不因选择、焦点或预览状态变化

### Requirement: 文本进入可视化模式时不得静默丢失不支持内容
从文本工作台或 catalog example 进入可视化模式时，系统必须（MUST）先解析并检查 Schema/UI Schema 是否属于受支持子集。受支持输入必须（MUST）恢复等价字段顺序、配置和 layout；语法错误、未知 keyword、无法表示的嵌套数据结构、重复 field view 或自定义 layout/Widget 等输入必须（MUST）报告定位诊断并保持原始五份 workbench 文本不变。用户只有在明确确认新建可视化文档后才可以（MUST）替换不支持的 Schema/UI Schema。

#### Scenario: 导入受支持的文本定义
- **GIVEN** 文本工作台包含受支持的 root object scalar properties、fields 和 layout
- **WHEN** 用户切换到可视化模式
- **THEN** 画布恢复等价组件、顺序与属性，再次生成的 Schema/UI Schema 与输入语义等价

#### Scenario: 不支持内容阻止可视化写入
- **GIVEN** Schema 包含当前可视化子集不支持的 conditional 或 nested array，或 UI Schema 包含自定义 layout type
- **WHEN** 用户切换到可视化模式
- **THEN** 系统显示不支持诊断，不改写任何 workbench 文本，也不把未知内容降级为普通字段或 layout

#### Scenario: 明确确认后新建文档
- **GIVEN** 当前 Schema/UI Schema 不能被可视化导入且诊断已展示
- **WHEN** 用户选择新建可视化文档并确认将替换 Schema/UI Schema
- **THEN** 系统创建空的受支持 root object 文档，同时继续保留原有 rules、config 与 formData 文本

### Requirement: 可视化变更复用现有编译与多适配器预览链路
每次已提交的可视化变更必须（MUST）通过现有 workbench 诊断和 `form-playground-v1` 文档广播进入全部预览 iframe。编译成功时各预览必须（MUST）消费同一 Form Definition；解析或编译失败时必须（MUST）显示结构化诊断并保留最近一次成功预览，不得发布 partial `CompiledFormModel` 或绕过 Renderer/Adapter 边界。

#### Scenario: 成功变更刷新全部预览
- **GIVEN** 当前可视化文档已成功编译并显示在多个预览 Adapter 中
- **WHEN** 用户提交一个合法字段或 layout 变更
- **THEN** 全部预览接收同一新 workbench 文档并按各自 Renderer/Adapter 呈现语义等价的表单

#### Scenario: 编译失败保留最近成功预览
- **GIVEN** 已存在最近一次成功预览
- **WHEN** 一次已提交的文档变更触发编译 Diagnostic
- **THEN** playground 展示该 Diagnostic，预览继续显示最近一次成功 Definition，失败文档不创建 FormInstance

### Requirement: 用户可以复制或下载稳定的 Definition 产物
可视化编辑器必须（SHALL）允许用户分别导出格式化 Draft 2020-12 Schema、UI Schema 和由 `schema`、`uiSchema`、既有 `rules`、`config` 组成的完整 Form Definition JSON。复制与下载必须（MUST）使用同一已诊断的 workbench 快照；存在未提交的属性错误、导入阻断诊断或编译错误时必须（MUST）阻止导出并说明原因。

#### Scenario: 复制和下载完整定义
- **GIVEN** 当前可视化文档通过 authoring 与编译诊断
- **WHEN** 用户复制 Schema 并下载完整 Form Definition
- **THEN** 两个产物来自同一稳定快照、使用 UTF-8 格式化 JSON，完整定义包含当前 schema/uiSchema/rules/config 且不包含 Runtime values

#### Scenario: 错误状态阻止陈旧导出
- **GIVEN** 属性检查器存在未提交错误或当前 workbench 编译失败
- **WHEN** 用户请求任一导出
- **THEN** 系统不复制或下载声称为当前版本的产物，并把阻断原因关联到当前错误状态

### Requirement: 可视化 authoring 的核心操作可访问且焦点可恢复
组件面板、画布节点、属性检查器、删除、移动和导出控件必须（MUST）具有可辨识名称与键盘访问路径。新增、移动、删除或校验失败后，焦点必须（MUST）移动到仍存在且语义合理的控件，并且选择、拖拽和错误状态不得只通过颜色表达。

#### Scenario: 删除选中节点后恢复焦点
- **GIVEN** 键盘用户在画布中选中了一个字段
- **WHEN** 用户删除该字段
- **THEN** 焦点移动到相邻节点、父容器或空画布中的可操作入口，并宣布删除结果

#### Scenario: 属性错误可被辅助技术定位
- **GIVEN** 用户在检查器输入一个无效 key 或不兼容 default
- **WHEN** 校验失败
- **THEN** 对应控件具有可感知的错误关联与文字说明，用户可从画布节点定位到该错误
