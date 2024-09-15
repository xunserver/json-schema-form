# core-plugin-environment Specification

## Purpose

为 Compiler 与 Runtime 提供显式、确定、冻结且框架无关的 Core extension 集合，并在任何扩展被消费前统一暴露依赖、兼容性和注册冲突问题。

## Requirements

### Requirement: Plugin authoring 描述框架无关的逻辑贡献
Core 必须（SHALL）从 `@form/core/extension` 暴露无副作用的 `definePlugin()` 与只读 Plugin contract。Plugin 必须（MUST）具有稳定 ID，并且可以声明 Widget、Schema Dialect、Schema Extension、Rule Function、Validator、Serializer、Value Initializer 和只读 Instrumentation contribution；这些 contribution 不得（MUST NOT）包含 framework component、DOM event、UI library 类型或 Runtime instance state。

#### Scenario: 声明包含多类 contribution 的 Plugin
- **GIVEN** 扩展作者提供唯一 Plugin ID 以及 Widget、Rule Function 和 Validator contribution
- **WHEN** 调用 `definePlugin()`
- **THEN** 返回值保留各 contribution 的只读 authoring 信息，但不安装 Plugin 或修改任何 Registry

#### Scenario: 拒绝 framework binding
- **GIVEN** 扩展作者尝试把 Vue/React component 或 UI library native event 放入 Core Widget Definition
- **WHEN** TypeScript 检查该 contribution
- **THEN** Core Extension contract 不提供承载该 binding 的标准成员

### Requirement: Environment 通过显式输入构建
Core 必须（SHALL）从 `@form/core/extension` 暴露 `createFormEnvironment()`，仅从本次调用的 Plugin 与配置构建 Core Registry，不得（MUST NOT）读取或修改 global singleton registry。Core 必须（SHALL）同时提供不安装用户 Plugin 的默认 Environment，以支持后续 Application API 短路径。

#### Scenario: 构建显式 Environment
- **GIVEN** 调用者提供一组业务 Plugin
- **WHEN** 调用 `createFormEnvironment()`
- **THEN** 产生的 Environment 只包含 Core 默认贡献与本次显式提供的 Plugin contribution

#### Scenario: 获取默认 Environment
- **GIVEN** 调用者不需要任何业务 Plugin
- **WHEN** 请求 Core 默认 Environment
- **THEN** 获得可被后续 Compiler 与 Runtime 复用的已构建、冻结 Environment

#### Scenario: Environment 不泄漏到后续构建
- **GIVEN** 先后构建两个 Plugin 集合不同的 Environment
- **WHEN** 分别检查它们的 Registry
- **THEN** 一个 Environment 的用户 contribution 不会出现在另一个 Environment 中

### Requirement: 默认 Environment 提供首期逻辑 Widget Definition
默认 Core Environment 必须（SHALL）能按稳定 key 解析 `text`、`textarea`、`number`、`select`、`multi-select`、`checkbox`、`switch`、`date` 和 `datetime` 逻辑 Widget Definition。每个 Definition 必须（MUST）描述框架无关的 value、props、matcher、capability 与 default contract，不得包含具体 Renderer binding。

#### Scenario: 解析默认 text Widget
- **GIVEN** 调用者获得默认 Core Environment
- **WHEN** 从 Widget Registry 查询 `text`
- **THEN** 返回一个描述 canonical value 与逻辑交互能力的只读 Widget Definition

#### Scenario: 默认 Widget 不绑定 UI library
- **GIVEN** 调用者检查任一默认 Widget Definition
- **WHEN** 遍历其公开 contract
- **THEN** 其中不包含 Vue/React component、Element Plus/MUI props 或 DOM event handler

### Requirement: Plugin 依赖按确定顺序解析
Environment build 必须（SHALL）在注册 contribution 前解析 Plugin 依赖，使每个依赖先于依赖方安装；互不依赖的 Plugin 必须（MUST）保持调用者给定的相对顺序。缺失依赖或依赖环必须（MUST）阻止 Environment 成功构建并产生结构化 Plugin diagnostic。

#### Scenario: 依赖先于依赖方安装
- **GIVEN** Plugin `feature` 依赖 Plugin `base`，且调用者以相反顺序提供二者
- **WHEN** 构建 Environment
- **THEN** `base` 的 contribution 在 `feature` 之前注册，且结果顺序可重复

#### Scenario: 保持无依赖 Plugin 的输入顺序
- **GIVEN** 两个互不依赖的 Plugin 按 `alpha`、`beta` 顺序提供
- **WHEN** 重复构建 Environment
- **THEN** 每次都按该相对顺序处理二者

#### Scenario: 报告缺失依赖
- **GIVEN** Plugin 声明依赖一个未提供且非 Core 内置的 Plugin ID
- **WHEN** 构建 Environment
- **THEN** 构建失败，并暴露包含依赖方与缺失 Plugin ID 的 error Diagnostic

#### Scenario: 报告依赖环
- **GIVEN** 两个或更多 Plugin 形成依赖环
- **WHEN** 构建 Environment
- **THEN** 构建失败，并暴露标识环中 Plugin ID 的 error Diagnostic

### Requirement: Environment 校验 Plugin protocol compatibility
Plugin 可以（MAY）声明其支持的 Core extension protocol version 范围。Environment build 必须（SHALL）在注册 contribution 前校验该范围；不兼容的 Plugin 必须（MUST）阻止构建并产生包含 Plugin ID、请求范围与当前 protocol version 的结构化 Diagnostic。

#### Scenario: 接受兼容 Plugin
- **GIVEN** Plugin 声明的 protocol range 包含当前 Core protocol version
- **WHEN** 构建 Environment
- **THEN** 该 Plugin 可以继续参与依赖解析与 contribution 注册

#### Scenario: 拒绝不兼容 Plugin
- **GIVEN** Plugin 声明的 protocol range 不包含当前 Core protocol version
- **WHEN** 构建 Environment
- **THEN** 构建失败，并暴露 `source` 为 `plugin` 且关联该 Plugin ID 的 error Diagnostic

### Requirement: Registry 冲突不得静默覆盖
重复 Plugin ID 或同类 Registry 中重复 key 必须（MUST）默认阻止 Environment 成功构建并产生结构化 Diagnostic。Registry key 覆盖只有在 Environment 配置对目标 Registry、key 与替换 Plugin 作出显式批准时才允许（MAY）；允许的覆盖必须（MUST）具有确定结果且可通过 diagnostics 或检查信息识别。

#### Scenario: 拒绝重复 Plugin ID
- **GIVEN** 调用者提供两个 ID 相同的 Plugin
- **WHEN** 构建 Environment
- **THEN** 构建失败，并暴露关联重复 ID 的 error Diagnostic

#### Scenario: 默认拒绝重复 Registry key
- **GIVEN** 两个不同 Plugin 向 Widget Registry 注册相同 key
- **WHEN** 未配置覆盖并构建 Environment
- **THEN** 构建失败，并暴露包含 Registry 类别、key 与两个 Plugin ID 的 error Diagnostic

#### Scenario: 应用显式批准的覆盖
- **GIVEN** Environment 配置明确批准 Plugin `company` 覆盖 Widget key `text`
- **WHEN** Core 默认贡献与 `company` contribution 注册该 key
- **THEN** Registry 确定地解析为 `company` 的 Definition，并保留可识别该覆盖的非阻断信息

#### Scenario: 拒绝宽泛或不匹配的覆盖许可
- **GIVEN** 覆盖配置未同时匹配目标 Registry、key 与替换 Plugin
- **WHEN** contribution 发生冲突
- **THEN** 该冲突仍按未批准冲突处理并阻止构建

### Requirement: 成功构建的 Environment 与 Registry view 保持冻结
Environment build 成功后，Environment、Plugin 清单与所有公开 Registry view 必须（MUST）为只读且不可通过公共 API 修改。Compiler、Runtime、Plugin 和 Instrumentation 不得（MUST NOT）借助这些 view 添加、删除或替换 contribution，也不得修改 `CompiledFormModel` 或绕过 Runtime transaction boundary。

#### Scenario: 拒绝构建后的 Registry mutation
- **GIVEN** 调用者持有成功构建的 Environment
- **WHEN** 尝试通过公共 API 添加、删除或替换 Registry entry
- **THEN** 类型契约不提供 mutation 操作，且运行时内容保持不变

#### Scenario: 重复构建产生隔离实例
- **GIVEN** 使用相同 Plugin 与配置分别构建两个 Environment
- **WHEN** 检查二者的 Registry 语义并尝试影响其中一个
- **THEN** 二者具有语义等价的解析结果，但不共享可被调用者修改的 Registry state

#### Scenario: Instrumentation 仅观察公共信息
- **GIVEN** Plugin 注册 Instrumentation contribution
- **WHEN** 后续 Compiler 或 Runtime 向其提供观察事件
- **THEN** contract 只允许读取公开信息，不允许替换编译结果、改写 mutation value 或取得 Transaction Manager

### Requirement: Environment build failure 暴露统一 Diagnostic
任何阻断性 Environment build 问题必须（MUST）通过包含一条或多条只读 `Diagnostic` 的结构化失败暴露；每条 Plugin build Diagnostic 必须（MUST）使用 `source: "plugin"`、稳定 code、severity、message，并在适用时包含 `pluginId` 与只读 metadata。失败不得（MUST NOT）返回可供 Compiler 或 Runtime 使用的部分 Environment。

#### Scenario: 消费结构化构建失败
- **GIVEN** Environment 输入同时包含缺失依赖与 Registry key 冲突
- **WHEN** 构建无法完成
- **THEN** 调用者获得可按稳定 code 检查的只读 diagnostics，且没有可用的部分 Environment

#### Scenario: Diagnostic metadata 保持只读
- **GIVEN** 冲突 Diagnostic 包含 Registry 类别、key 和相关 Plugin ID
- **WHEN** 调用者读取该 Diagnostic
- **THEN** metadata 可用于定位问题但不能通过公共类型被修改
