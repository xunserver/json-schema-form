# package-architecture Specification

## Purpose

定义可安装的工作区单元与可强制执行的依赖边界，使表单引擎能够跨框架、Renderer、Validator 和非 DOM 环境保持可移植性。

## Requirements

### Requirement: 首期工作区 package
工作区必须（SHALL）以一个 pnpm/TypeScript monorepo 管理并暴露可构建的 `@form/core`、`@form/validator-ajv`、`@form/vue`、`@form/react` 和 `@form/element-plus` package。工作区可以（MAY）额外包含沿相同边界模式的 UI Adapter package（例如 `@form/antd`、`@form/arco-vue`、`@form/arco-react`），它们必须（MUST）出现在产品依赖 allowlist 中。

#### Scenario: 发现全部首期 package
- **GIVEN** 一个已安装工作区依赖的干净 checkout
- **WHEN** pnpm 枚举工作区并运行仓库构建和类型检查命令
- **THEN** 系统发现全部五个首期 package 以及任何已登记的额外 UI Adapter package，且每个 package 均能通过其声明的空公共边界完成检查

#### Scenario: 解析 package 局部 TypeScript 配置
- **GIVEN** 任意一个首期或已登记 UI Adapter package
- **WHEN** 独立检查其 TypeScript project
- **THEN** 该 project 继承共享编译契约，并且只解析该 package 显式声明的输入

### Requirement: Package 依赖方向
Package 元数据和源码 import 只允许以下产品依赖边（SHALL）：`@form/validator-ajv` 指向 `@form/core`，`@form/vue` 指向 `@form/core`，`@form/react` 指向 `@form/core`，`@form/element-plus` 指向 `@form/vue` 与 `@form/core`，`@form/antd` 指向 `@form/react` 与 `@form/core`，`@form/arco-vue` 指向 `@form/vue` 与 `@form/core`，`@form/arco-react` 指向 `@form/react` 与 `@form/core`。任何首期或额外 UI Adapter package 都不得（SHALL NOT）引入反向或跨框架产品依赖。

#### Scenario: 接受合法依赖图
- **GIVEN** manifest 和 import 只包含允许的产品依赖边
- **WHEN** 运行 package 边界检查
- **THEN** 依赖图通过检查

#### Scenario: 拒绝反向依赖
- **GIVEN** `@form/core` 从 `@form/vue` 导入内容或将其声明为依赖
- **WHEN** 运行 package 边界检查
- **THEN** 检查失败，并指出违规的源 package 和目标 package

#### Scenario: 拒绝跨框架 Adapter 依赖
- **GIVEN** `@form/antd` 依赖 `@form/vue` 或 `@form/element-plus`
- **WHEN** 运行 package 边界检查
- **THEN** 检查失败，并指出不受支持的依赖边

### Requirement: 框架宿主使用 peer dependency
框架集成 package 必须（SHALL）将宿主框架和 UI library 要求表达为 peer dependency；工作区内的 `@form/*` 关系必须遵循允许的产品依赖图。

#### Scenario: 检查框架 package manifest
- **GIVEN** 五个首期 package 与已登记 UI Adapter package 的 manifest
- **WHEN** 校验依赖策略
- **THEN** Vue、React、Element Plus、Ant Design、Arco Design 等宿主要求出现在对应集成 package 的 peer dependency 中

#### Scenario: 拒绝打包宿主框架
- **GIVEN** 某框架集成 package 将其宿主框架或 UI library 放入会被打包的生产依赖
- **WHEN** 校验依赖策略
- **THEN** 检查失败，并指出相关 package 和放置错误的依赖

### Requirement: Core 独立于框架、DOM、UI library 和 AJV
`@form/core` 必须（SHALL）能够在其依赖图和源码 import 图不包含 Vue、React、DOM 类型库、具体 UI library 或 AJV 的情况下完成构建和类型检查。

#### Scenario: 在非 DOM 环境验证 Core
- **GIVEN** Core TypeScript project 使用 ECMAScript library 且不包含 DOM library
- **WHEN** 构建 Core 并执行类型检查
- **THEN** 检查成功，且无需解析浏览器全局对象或框架、UI library、AJV 类型

#### Scenario: 检测 Core 禁止 import
- **GIVEN** Core 源文件导入 Vue、React、AJV、Element Plus、Ant Design 或 DOM-only API
- **WHEN** 运行 Core 独立性检查
- **THEN** 至少一项检查失败，并指出禁止依赖或不可用的 DOM 契约

### Requirement: Core 内部目录按架构生命周期领域组织
`packages/core/src/` 的顶层目录必须（SHALL）恰好为 `definition/`、`schema/`、`compiler/`、`model/`、`runtime/`、`widget/`、`rule/`、`validation/`、`extension/`、`diagnostic/`、`engine/` 与入口 `index.ts`；`compiler/` 必须（MUST）包含 `schema/`、`shape/`、`data/`、`ui/`、`rule/`、`validation/`、`dynamics/` 子领域，`model/` 必须（MUST）包含 `data/`、`ui/`、`rule/`、`validation/`、`schema-dynamics/`、`path/`、`identity/`，`runtime/` 必须（MUST）包含 `form/`、`value/`、`state/`、`transaction/`、`array/`、`dependency/`、`subscription/`、`scope/`、`rule/`、`validation/`、`dynamics/`。领域内可以（MAY）存在内部 `index.ts` 与局部 helper 文件，测试必须（MUST）与其领域代码 colocate；不得（MUST NOT）建立顶层 `types/`、`services/`、`utils/` 目录。目录调整不得（MUST NOT）改变 package `exports`、公开 declarations 或运行时行为。

#### Scenario: 顶层目录与架构一致
- **GIVEN** 当前 `packages/core/src` 布局
- **WHEN** 运行仓库边界检查
- **THEN** 顶层目录集合与要求的集合完全一致，缺失或多出的目录会以目录名与规则 ID 报告

#### Scenario: 子领域目录存在且承载对应代码
- **GIVEN** `compiler/`、`model/`、`runtime/` 三个领域
- **WHEN** 检查其子目录
- **THEN** 要求的子领域目录全部存在，Validation compiler/model/runtime 代码位于对应 `validation/` 子目录，Schema Dynamics 位于 `compiler/dynamics/` 与 `runtime/dynamics/`，array identity 与 scope facade 位于 `runtime/array/` 与 `runtime/scope/`，path/identity 类型位于 `model/path/` 与 `model/identity/`

#### Scenario: 目录迁移不改变公共边界
- **GIVEN** 目录按本要求调整前后的两次构建
- **WHEN** 比较 package `exports`、生成的 declarations 与 consumer contract fixtures
- **THEN** 三个 Core 入口的公开符号集合不变，正负 consumer fixtures 结果不变，deep import 仍被拒绝

#### Scenario: 拒绝垃圾桶目录
- **GIVEN** 有人在 `packages/core/src` 新增顶层 `utils/` 目录
- **WHEN** 运行仓库边界检查
- **THEN** 检查以失败状态退出并指出该目录不属于架构领域集合

### Requirement: 仓库验证包含边界检查
仓库必须（SHALL）提供可重复运行的验证命令，从干净 checkout 检查 manifest、源码依赖方向、Core 独立性、Core 内部目录领域集合、package 构建、类型正确性和边界契约测试。

#### Scenario: 验证未修改的合规工作区
- **GIVEN** 一个所有 package 均符合声明边界的干净 checkout
- **WHEN** 运行仓库验证命令
- **THEN** 所有架构、目录与 package 契约检查均通过，且不要求存在应用示例

#### Scenario: 报告可操作的边界错误
- **GIVEN** 存在 manifest、import、目录集合或编译器 library 违规
- **WHEN** 运行仓库验证
- **THEN** 命令以失败状态退出，并报告足以定位问题的 package、路径和规则信息

### Requirement: AJV具体依赖与实现只属于validator package
`@form/validator-ajv`必须（SHALL）作为`@form/core` Validator Adapter协议的叶子实现持有AJV生产依赖，并且只能沿既有`@form/validator-ajv -> @form/core`产品依赖边消费公共契约。`@form/core`及Vue、React、Element Plus 与 UI Adapter package不得（MUST NOT）直接依赖、导入或在公共declaration中引用AJV类型；Core validation行为必须（MUST）在没有AJV package时仍可构建和类型检查。

#### Scenario: validator-ajv合法依赖AJV与Core
- **GIVEN** `@form/validator-ajv` manifest声明AJV和`@form/core`，源码只从Core受支持入口导入协议
- **WHEN** 运行workspace build、typecheck和boundary checks
- **THEN** package成功构建且既有产品依赖方向保持不变

#### Scenario: 拒绝Core或Renderer导入AJV
- **GIVEN** Core或任一framework/UI package直接import AJV或在公共类型中暴露AJV `ErrorObject`
- **WHEN** 运行Core independence、declaration和architecture checks
- **THEN** 检查失败并指出违规package、import或declaration边界

### Requirement: Vue 与 Element Plus 只暴露受支持 Renderer 入口
`@form/vue` 根入口必须（SHALL）暴露 Vue Renderer components、readonly composables、VueUIAdapter/RendererEnvironment authoring与diagnostic contracts；`@form/element-plus` 根入口必须（SHALL）暴露标准 Element Plus adapter及显式组合/扩展入口。两包的 export map必须（MUST）拒绝未声明 deep import，并不得（MUST NOT）从公共 declarations 泄漏 Core mutable internals、Element Plus private types、React/Ant Design协议或 Universal Renderer抽象。

#### Scenario: 应用从根入口组合 Renderer
- **GIVEN** consumer从 `@form/vue` 导入 `FormRenderer` 和 Vue adapter contracts，并从 `@form/element-plus` 导入标准 adapter
- **WHEN** 使用 `<FormRenderer :form="form" :adapter="elementPlusAdapter" />` 类型检查
- **THEN** import与组件props成立且不需要Core/internal或package deep path

#### Scenario: deep import 与跨框架类型被拒绝
- **GIVEN** consumer尝试导入 Vue内部subscription/store writer、Element Plus内部mapper，或从两包取得React/Ant Design binding
- **WHEN** 按package exports与declarations解析
- **THEN** import失败，批准的根入口仍可独立使用

### Requirement: Vue/Element Plus 依赖与集成验收可重复验证
`@form/vue` 必须（MUST）只沿产品边依赖 `@form/core` 并把 Vue列为peer；`@form/element-plus` 必须（MUST）只沿产品边依赖 `@form/vue`/`@form/core` 并把 Vue与Element Plus列为peer。仓库验证必须（MUST）包含不依赖具体UI library的headless Vue Renderer contract tests、Element Plus adapter integration tests，以及 `examples/playground` 中使用同一Definition/Plugin/Compiled Model的 Vue + Element Plus 预览；这些验收不得（MUST NOT）要求或导入React/Ant Design实现。

#### Scenario: headless adapter验证 Renderer契约
- **GIVEN** 测试提供一个记录调用的最小VueUIAdapter和事务Runtime
- **WHEN** 覆盖View遍历、精确订阅、hidden卸载、array move、cleanup与SSR
- **THEN** 测试无需Element Plus即可证明Renderer边界，且没有Schema/Rule/Validation解释或直接value写入

#### Scenario: Element Plus example完成端到端交互
- **GIVEN** playground 与 integration tests 编译并实例化含嵌套object/array、动态visible、validation与九类Widget的Definition
- **WHEN** Vue + Element Plus renderer执行输入、blur、array move与submit流程
- **THEN** UI只通过semantic commands更新Core，identity/presentable errors/ARIA正确，workspace build/typecheck/test/boundary checks均通过

### Requirement: React 与 UI adapter 渲染包只公开受支持入口
`@form/react` 根入口必须（MUST）公开 React renderers、readonly hooks、`ReactUIAdapter` 与 `ReactRendererEnvironment` 的创建/组合契约及结构化 diagnostics。Ant Design 等 UI adapter 通过各自根入口公开冻结 adapter 及其受支持的组合/扩展入口。内部 Context、component factories、registry storage、mapper helpers 与 UI library implementation types 不得（MUST NOT）成为可依赖 deep import；`RenderScope`/`InstanceBinding` 等 Core-owned共享类型必须（MUST）从其 Core owning 入口导入，React包只消费而不得重新定义或建立第二个owner。

#### Scenario: 消费者只使用根入口
- **GIVEN** 外部应用使用 TypeScript NodeNext 编译 React+Ant Design 表单
- **WHEN** 它从 `@form/react` 与 `@form/antd` 根入口导入公开 API
- **THEN** declarations 与 runtime exports 一致且无需 deep import

#### Scenario: 内部模块不可跨包导入
- **GIVEN** 消费者或 `@form/antd` 尝试导入 `@form/react` 未导出的内部 Context/registry 文件
- **WHEN** package exports resolution 执行
- **THEN** 该 deep import 不可解析，而受支持公开 adapter types 可从根入口解析

### Requirement: React 与 UI adapter 依赖方向保持单向
`@form/react` 必须（MUST）只依赖 `@form/core` 并把 React 声明为兼容 peer；`@form/antd` 必须（MUST）只依赖 `@form/core`、`@form/react` 并把 React 与 `antd` 声明为兼容 peer。React、React DOM、Ant Design 等 host runtime 不得（MUST NOT）被打包进库产物，Core 不得（MUST NOT）新增 React/Ant Design/DOM 依赖；默认 adapter 不得（MUST NOT）强制依赖日期对象库。

#### Scenario: manifest 与产物边界通过
- **GIVEN** workspace 构建 `@form/react` 与 `@form/antd`
- **WHEN** manifest-policy、bundle/external 与 dependency-boundary 检查运行
- **THEN** 依赖方向符合白名单，host peers 保持 external，`@form/core` 仍可在无 DOM/React/Ant Design 环境导入

#### Scenario: React renderer 可 headless 测试
- **GIVEN** 测试只提供 React、Core 与一个无 UI library 的 fake ReactUIAdapter
- **WHEN** 渲染 resolved ViewTree 并驱动语义交互
- **THEN** `@form/react` 不要求 Ant Design、Vue、Element Plus 或浏览器 validation store 即可工作

### Requirement: React 与 UI adapter 提供完整集成验收入口
Workspace 必须（MUST）包含 React headless contract、StrictMode subscription cleanup、SSR/hydration、Ant Design 九种 Widget/codec/props/ARIA/layout 集成测试。公开消费者示例是 `examples/playground`；React/Ant Design 端到端行为由 integration tests 覆盖。跨栈验收必须（MUST）复用与 Vue/Element Plus 相同的 Core Definition/Plugin fixture 来比较 values、identity、effective state、validation 与 submit 结果，但不得（MUST NOT）让 React/Ant Design 包导入 Vue 协议或建立 Universal Renderer。

#### Scenario: React+Ant Design 示例覆盖端到端行为
- **GIVEN** integration tests 编译并实例化含嵌套 object/array、动态 visible、validation 与九种 Widget 的 Definition
- **WHEN** 用户编辑、重排、blur、验证并提交
- **THEN** UI 只经公开 semantic APIs 改变同一 Core truth，且 build、typecheck 与 integration tests 通过

#### Scenario: SSR 与浏览器集成均受覆盖
- **GIVEN** 同一 React fixture 可在 server renderer 和浏览器测试环境运行
- **WHEN** 执行 render-to-string、hydrate、StrictMode remount 与后续 commit
- **THEN** 初始 markup 一致、订阅无泄漏且 selector 精准更新契约持续成立

### Requirement: v1 架构门禁覆盖完整发布工作区
工作区必须（SHALL）在既有仓库验证之外提供完整 v1 架构门禁，覆盖全部首期 package、`examples/playground`、`examples/shared`、架构约定的顶层目录、批准的 package exports、产品与 peer dependency、Core 环境可移植性、headless/integration contract、SSR/hydration 以及机器可检查的 architecture traceability。Gate 必须（MUST）只通过公开 package 入口运行消费者场景；缺失 package/example/目录、manifest 与 declaration/runtime export 不一致、未声明 deep import 可达或跨框架/反向依赖必须（MUST）使其失败。

#### Scenario: 完整工作区从公开入口通过
- **GIVEN** 一个安装锁定依赖的干净 checkout，包含五个首期 package、已登记 UI Adapter、playground/shared examples 和全部已登记验收入口
- **WHEN** 运行 v1 architecture gate
- **THEN** build、typecheck、boundary、contract、integration、SSR/hydration、playground 与 traceability 全部通过，且每个运行时 export 都有对应 declaration

#### Scenario: 缺失 example 或非法 export 阻断发布
- **GIVEN** playground 缺失/无法类型检查，或 package 暴露未批准 deep path、内部 writer、跨 framework 类型
- **WHEN** 运行 v1 architecture gate
- **THEN** gate 以失败状态指出 package、路径与违反的架构条目，基础单元测试通过也不能覆盖该失败

### Requirement: v1 gate 保持产品依赖与宿主边界
完整 v1 门禁必须（MUST）复用并加强既有产品依赖 allowlist：`@form/core` 保持无产品依赖，`@form/validator-ajv`、`@form/vue`、`@form/react` 只指向 Core，UI library package只指向各自 Renderer与Core；Vue、React及UI libraries继续作为对应集成包的 peer，AJV只属于 validator package。Example与test所需host dependencies可以（MAY）位于非发布工作区，但不得（MUST NOT）改变 package产物、declaration或产品依赖图。

#### Scenario: 测试宿主依赖不污染发布包
- **GIVEN** playground 与 SSR/browser tests安装Vue、React、Element Plus、Ant Design、Arco Design、AJV及测试宿主
- **WHEN** 检查产品 package 的manifest、构建产物与declarations
- **THEN** host libraries只出现在允许位置且保持external，Core与另一framework链路不获得传递产品依赖

#### Scenario: MUI X 或跨框架依赖被拒绝
- **GIVEN** 默认 Ant Design/Arco adapter引入日期对象库或未批准的日期选择器包，或任一React/Vue链路导入另一framework/UI library package
- **WHEN** 执行v1 dependency和bundle检查
- **THEN** gate失败并定位不在allowlist中的dependency/import，不能以example能够运行作为豁免

