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

### Requirement: defineRuleFunction 是无副作用authoring helper
Core必须（SHALL）从`@form/core/extension`暴露`defineRuleFunction()`，保留Rule Function descriptor的name、同步provider和具体参数/结果类型。该helper必须（MUST）返回输入identity，不安装function、不构建Environment、不执行provider，也不得（MUST NOT）读写global Registry。

#### Scenario: 声明named Rule Function
- **GIVEN** extension author提供唯一name和同步pure provider
- **WHEN** 调用`defineRuleFunction()`
- **THEN** 返回值保留literal name与provider类型，默认或既有Environment不会因此新增Registry entry

#### Scenario: 重复authoring不产生全局状态
- **GIVEN** 独立声明两个同名Rule Function但尚未放入Plugin
- **WHEN** 分别调用helper
- **THEN** 两个descriptor保持独立，冲突只在它们实际进入同一Environment Registry时按既有策略诊断

### Requirement: Rule Function 与Serializer provider是纯同步只读边界
`RuleFunctionDefinition`必须（MUST）包含只接收readonly JSON-compatible args并同步返回JSON-compatible结果的provider；`SerializerDefinition`必须（MUST）包含只接收readonly JSON-compatible value与readonly serialization context并同步返回JSON-compatible结果的provider；`SchemaDialectDefinition`必须（MUST）声明其负责的非空`$schema` URI集合与只接收readonly原始Schema并同步返回Draft 2020-12 JSON Schema及readonly diagnostics的`convert()`；`SchemaExtensionDefinition`必须（MUST）声明一个以`x-`开头的keyword与只接收readonly keyword值、`SchemaPath`、`ModelPath`并同步返回可选`FieldUI`、Rule Definition与Form Config片段的`split()`；`ValueInitializerDefinition`必须（MUST）包含只接收readonly提供的initial values与只读`CompiledFormModel`并同步返回JSON-compatible完整values的`initialize()`。所有公共provider contract不得（MUST NOT）包含FormInstance、mutable Store、Transaction Manager、DependencyScheduler、RuntimeNodeId、fetch/remote source或command capability，也不得返回Promise/thenable。

#### Scenario: Plugin注册可调用providers
- **GIVEN** Plugin contributions包含由helper创建的Rule Function和一个Serializer descriptor
- **WHEN** Environment成功构建
- **THEN** 两个Registry以readonlyprovider identity和provenance暴露它们，且调用前后Registry内容保持冻结

#### Scenario: Plugin注册dialect、extension与initializer providers
- **GIVEN** Plugin contributions包含声明`https://json-schema.org/draft-07/schema`的dialect adapter、声明`x-ui`的schema extension与一个value initializer
- **WHEN** Environment成功构建
- **THEN** 三个Registry以readonly descriptor identity、URI/keyword元数据和provenance暴露它们，Environment不执行任何provider

#### Scenario: 类型拒绝async与mutable context
- **GIVEN** author尝试声明返回Promise的Rule Function、接收Form/Store writer的Serializer、返回Promise的dialect `convert()`或接收FormInstance的value initializer
- **WHEN** TypeScript检查provider contract
- **THEN** 定义因不属于同步readonly边界而失败

### Requirement: contribution key与provider name必须一致
Environment build必须（MUST）校验`ruleFunctions`、`serializers`、`schemaDialects`、`schemaExtensions`与`valueInitializers`中每个Registry key与descriptor name完全一致，并继续对重复key应用既有精确override策略。此外，`schemaDialects`中任一`$schema` URI与`schemaExtensions`中任一keyword必须（MUST）在整个Environment内唯一；非`x-`前缀的extension keyword、空URI集合、不匹配、缺失或非法provider shape必须（MUST）阻止Environment发布并产生`source: "plugin"`的稳定Diagnostic，不得返回partial callable Registry。

#### Scenario: 接受一致的key与name
- **GIVEN** Plugin在`ruleFunctions["company.tax"]`注册name同为`company.tax`的descriptor
- **WHEN** 构建Environment
- **THEN** Registry按该唯一key提供确定lookup和provenance

#### Scenario: 拒绝key/name不一致
- **GIVEN** contribution key为`company.tax`但descriptor name为`other.tax`
- **WHEN** 构建Environment
- **THEN** `EnvironmentBuildError`包含registry、key、name和Plugin ID，且没有可用partial Environment

#### Scenario: 拒绝重复的dialect URI或extension keyword
- **GIVEN** 两个不同Plugin分别以不同key注册声明同一`$schema` URI的dialect adapter，或声明同一`x-ui` keyword的extension
- **WHEN** 构建Environment且没有显式override批准
- **THEN** build以`source: "plugin"` Diagnostic失败，metadata包含冲突URI/keyword与两个Plugin ID，不存在last-write-wins

#### Scenario: 拒绝非法extension keyword
- **GIVEN** schema extension声明keyword为`ui`或`properties`而非`x-`前缀
- **WHEN** 构建Environment
- **THEN** build以稳定Diagnostic失败并指出keyword与Plugin ID，Registry不发布该contribution

### Requirement: defineWidget 是无副作用的 Widget authoring helper
Core 必须（SHALL）只从 `@form/core/extension` 暴露泛型 `defineWidget()`，并在保留输入对象 identity 与 literal inference 的同时返回同一个 `WidgetDefinition`。该 helper 不得（MUST NOT）安装、复制、冻结或执行 Widget，不得（MUST NOT）读取或修改 global Registry；Widget contribution 的安装、owned snapshot、冻结、显式 override 与 key 冲突必须（MUST）继续只发生在 `createFormEnvironment()` 构建阶段。

#### Scenario: 保留自定义 Widget identity 与 literal
- **GIVEN** 扩展作者传入一个包含 literal name、value contract、interaction contract 与 matcher 的普通对象
- **WHEN** 调用 `defineWidget()`
- **THEN** 返回值与输入对象 identity 相同，TypeScript 保留其 literal 信息，且没有创建 Environment 或安装 contribution

#### Scenario: helper 调用不触发 Registry 冲突
- **GIVEN** 两个独立模块分别用 `defineWidget()` 声明准备注册到同一 Widget key 的 Definition
- **WHEN** 只执行两个 authoring helper
- **THEN** 两次调用都不访问共享状态；只有它们经 Plugin contribution 进入同一次 Environment build 时，既有冲突或显式 override 规则才生效

### Requirement: WidgetDefinition 声明框架无关的 semantic interaction contract
每个 `WidgetDefinition` 必须（MUST）以只读纯数据 contract 声明其支持的逻辑交互能力。首期标准 semantic actions 必须（MUST）覆盖 `setValue`、`touch`、`focus` 与 `blur`：`setValue` 只接收符合 `valueContract` 的 Core canonical value，其余 action 不携带 native event；输入 Widget 必须（MUST）声明 `setValue`，其他 action 的支持必须显式且可供 Compiler 与 framework Adapter preflight 检查。九个默认逻辑 Widget 必须（MUST）声明全部四项。该 contract 不得（MUST NOT）包含可执行 Runtime handler、DOM/native event、framework component、UI library 类型、`FormInstance`、Store、Transaction 或 state writer。

#### Scenario: 默认 Widget 提供完整 semantic action capability
- **GIVEN** 调用者检查默认 Environment 中的 text、textarea、number、select、multi-select、checkbox、switch、date 与 datetime Definition
- **WHEN** 读取它们的 interaction contract
- **THEN** 每个 Definition 都以冻结纯数据声明 `setValue`、`touch`、`focus` 与 `blur`，且不包含任何 native handler 或 Runtime object

#### Scenario: 自定义 Widget 只声明逻辑能力
- **GIVEN** 扩展作者使用 `defineWidget()` 声明一个 canonical object value 的 atomic Widget
- **WHEN** 该 Widget 经 Plugin 安装并由 Compiler/Adapter 检查
- **THEN** 检查只依据标准 semantic action key 与 value contract，Vue/React event shape、component ref 和 UI library props 均不进入 Core Definition

#### Scenario: 拒绝非法 interaction descriptor
- **GIVEN** Widget interaction contract 缺少必需的 `setValue`、包含未知 action，或尝试携带 function、native event、`FormInstance`/Store writer
- **WHEN** Environment 构建或 Compiler 检查该 contribution
- **THEN** 以 `source: "plugin"` 或 `source: "compiler"` 的稳定结构化 Diagnostic 失败，且不发布部分 Environment 或部分 `CompiledFormModel`

#### Scenario: Adapter capability 不足时不得静默降级
- **GIVEN** 已解析 Widget 声明某项 semantic action，而选定 framework Widget binding 无法提供该 action
- **WHEN** RendererEnvironment 对 binding 执行 capability preflight
- **THEN** 产生归 Adapter owner 的结构化 capability Diagnostic，且不得用 native event、直接 values 写入或省略动作来冒充兼容

### Requirement: defineValidator是无副作用authoring helper
Core必须（SHALL）从`@form/core/extension`暴露`defineValidator()`，保留named Validator或Schema Validator Adapter descriptor的literal name、kind、capabilities与provider类型。该helper必须（MUST）返回输入identity，不执行provider、不安装contribution、不构建Environment，也不得（MUST NOT）读取或修改global Registry。

#### Scenario: 声明named validator
- **GIVEN** extension author提供唯一name、validator kind与对应provider
- **WHEN** 调用`defineValidator()`
- **THEN** 返回值保留具体类型且当前Environment Registry不发生变化

#### Scenario: 重复authoring不提前产生冲突
- **GIVEN** 两次独立author同名descriptor但尚未放入同一Plugin
- **WHEN** 分别调用helper
- **THEN** 两个输入保持独立，冲突只在Environment实际注册时按既有规则诊断

### Requirement: Validator provider是框架无关的只读执行边界
Validator contribution必须（MUST）以kind区分同步Custom、异步Custom与Schema Adapter。Custom provider只能（MUST）接收Runtime-owned readonly target/dependency values、readonly options/context以及异步provider可选的AbortSignal-compatible readonly signal；它只能返回规范化issue data或对应Promise。Schema Adapter必须（MUST）提供同步`validateAll`，并可以（MAY）声明且实现`validateAt`/`validateAffected`安全优化。任何provider contract不得（MUST NOT）暴露FormInstance、mutable Store、TransactionManager、DependencyScheduler、Change Queue、`RuntimeNodeId`、framework component、DOM event或mutation capability。

#### Scenario: 同步与异步provider使用相同只读输入语义
- **GIVEN** Plugin分别贡献sync与async named validator
- **WHEN** Environment成功构建并由Runtime调用
- **THEN** 两者只能读取显式target/dependency/options，async provider额外只能观察可选取消信号，均不能隐藏读取或写Form state

#### Scenario: Schema Adapter保证validateAll
- **GIVEN** extension author声明Schema Adapter
- **WHEN** TypeScript和Environment检查descriptor
- **THEN** `validateAll`是必需同步能力，而incremental methods只有在descriptor显式声明对应safe capability时才可被Core使用

#### Scenario: 拒绝跨层provider能力
- **GIVEN** author尝试让provider取得Store writer、Renderer context或让同步provider返回Promise
- **WHEN** 执行类型或Environment shape检查
- **THEN** descriptor被拒绝且不发布partial Environment

### Requirement: Validator contribution校验key、name与capability一致性
Environment build必须（MUST）校验`validators` Registry的key与descriptor name完全一致、kind/provider shape合法，并验证每个声明的incremental capability具有对应method。错误必须（MUST）阻止Environment发布并产生`source: "plugin"`的稳定Diagnostic；合法重复key继续遵循既有精确override/provenance策略，成功Environment和Registry view继续冻结。

#### Scenario: 接受一致的validator descriptor
- **GIVEN** contribution key与descriptor name均为`company.unique-email`且async provider shape合法
- **WHEN** 构建Environment
- **THEN** Registry按该key提供确定readonly lookup与Plugin provenance

#### Scenario: 拒绝key或capability不一致
- **GIVEN** key与name不同，或Adapter声明safe `validateAffected`却没有对应method
- **WHEN** 构建Environment
- **THEN** `EnvironmentBuildError`包含registry、key、name/kind与Plugin ID且没有可用partial Environment
