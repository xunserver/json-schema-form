# package-architecture Specification

## Purpose

定义可安装的工作区单元与可强制执行的依赖边界，使表单引擎能够跨框架、Renderer、Validator 和非 DOM 环境保持可移植性。

## Requirements

### Requirement: 首期工作区 package
工作区必须（SHALL）以一个 pnpm/TypeScript monorepo 管理并暴露可构建的 `@xunserver-jsf/core`、`@xunserver-jsf/validator-ajv`、`@xunserver-jsf/vue`、`@xunserver-jsf/react` 和 `@xunserver-jsf/element-plus` package。工作区可以（MAY）额外包含沿相同边界模式的 UI Adapter package（例如 `@xunserver-jsf/antd`、`@xunserver-jsf/shadcn`），它们必须（MUST）出现在产品依赖 allowlist 中。

#### Scenario: 发现全部首期 package
- **GIVEN** 一个已安装工作区依赖的干净 checkout
- **WHEN** pnpm 枚举工作区并运行仓库构建和类型检查命令
- **THEN** 系统发现全部五个首期 package 以及任何已登记的额外 UI Adapter package（含 `@xunserver-jsf/shadcn`），且每个 package 均能通过其声明的空公共边界完成检查

#### Scenario: 解析 package 局部 TypeScript 配置
- **GIVEN** 任意一个首期或已登记 UI Adapter package
- **WHEN** 独立检查其 TypeScript project
- **THEN** 该 project 继承共享编译契约，并且只解析该 package 显式声明的输入

### Requirement: Package 依赖方向
Package 元数据和源码 import 只允许以下产品依赖边（SHALL）：`@xunserver-jsf/validator-ajv` 指向 `@xunserver-jsf/core`，`@xunserver-jsf/vue` 指向 `@xunserver-jsf/core`，`@xunserver-jsf/react` 指向 `@xunserver-jsf/core`，`@xunserver-jsf/element-plus` 指向 `@xunserver-jsf/vue` 与 `@xunserver-jsf/core`，`@xunserver-jsf/antd` 指向 `@xunserver-jsf/react` 与 `@xunserver-jsf/core`，`@xunserver-jsf/shadcn` 指向 `@xunserver-jsf/react` 与 `@xunserver-jsf/core`。任何首期或额外 UI Adapter package 都不得（SHALL NOT）引入反向或跨框架产品依赖。

#### Scenario: 接受合法依赖图
- **GIVEN** manifest 和 import 只包含允许的产品依赖边（含 `@xunserver-jsf/shadcn -> @xunserver-jsf/react + @xunserver-jsf/core`）
- **WHEN** 运行 package 边界检查
- **THEN** 依赖图通过检查

#### Scenario: 拒绝反向依赖
- **GIVEN** `@xunserver-jsf/core` 从 `@xunserver-jsf/vue` 导入内容或将其声明为依赖
- **WHEN** 运行 package 边界检查
- **THEN** 检查失败，并指出违规的源 package 和目标 package

#### Scenario: 拒绝跨框架 Adapter 依赖
- **GIVEN** `@xunserver-jsf/shadcn` 依赖 `@xunserver-jsf/vue` 或 `@xunserver-jsf/element-plus`
- **WHEN** 运行 package 边界检查
- **THEN** 检查失败，并指出不受支持的依赖边

### Requirement: 框架宿主使用 peer dependency
框架集成 package 必须（SHALL）将宿主框架和 UI library 要求表达为 peer dependency；工作区内的 `@xunserver-jsf/*` 关系必须遵循允许的产品依赖图。`@xunserver-jsf/shadcn` 必须（MUST）将 `react` 列为 peer；因其通过消费方注入组件而非 npm UI 库，不得（MUST NOT）要求 `antd` 类 UI library peer，也不得（MUST NOT）把 Tailwind 或 `@base-ui/react` 写入产品依赖。

#### Scenario: 检查框架 package manifest
- **GIVEN** 五个首期 package 与已登记 UI Adapter package 的 manifest
- **WHEN** 校验依赖策略
- **THEN** Vue、React、Element Plus、Ant Design 等宿主要求出现在对应集成 package 的 peer dependency 中，且 `@xunserver-jsf/shadcn` 仅要求 `react` peer

#### Scenario: 拒绝打包宿主框架
- **GIVEN** 某框架集成 package 将其宿主框架或 UI library 放入会被打包的生产依赖
- **WHEN** 校验依赖策略
- **THEN** 检查失败，并指出相关 package 和放置错误的依赖

### Requirement: Core 独立于框架、DOM、UI library 和 AJV
`@xunserver-jsf/core` 必须（SHALL）能够在其依赖图和源码 import 图不包含 Vue、React、DOM 类型库、具体 UI library 或 AJV 的情况下完成构建和类型检查。

#### Scenario: 在非 DOM 环境验证 Core
- **GIVEN** Core TypeScript project 使用 ECMAScript library 且不包含 DOM library
- **WHEN** 构建 Core 并执行类型检查
- **THEN** 检查成功，且无需解析浏览器全局对象或框架、UI library、AJV 类型

#### Scenario: 检测 Core 禁止 import
- **GIVEN** Core 源文件导入 Vue、React、AJV、Element Plus、Ant Design 或 DOM-only API
- **WHEN** 运行 Core 独立性检查
- **THEN** 至少一项检查失败，并指出禁止依赖或不可用的 DOM 契约

### Requirement: Core 内部目录按架构生命周期领域组织
`packages/core/src/` 的顶层目录必须（SHALL）恰好为 `definition/`、`schema/`、`compiler/`、`model/`、`runtime/`、`widget/`、`rule/`、`validation/`、`extension/`、`diagnostic/`、`engine/` 与入口 `index.ts`。`compiler/` 必须（MUST）包含 `schema/`、`shape/`、`data/`、`ui/`、`rule/`、`validation/`、`dynamics/` 子领域；`model/` 必须（MUST）包含 `data/`、`ui/`、`rule/`、`validation/`、`schema-dynamics/`、`path/`、`identity/`；`runtime/` 必须（MUST）包含 `form/`、`value/`、`state/`、`transaction/`、`array/`、`dependency/`、`subscription/`、`scope/`、`rule/`、`validation/`、`dynamics/`。领域内可以（MAY）存在内部 `index.ts` 与局部 helper 文件，测试必须（MUST）与其领域代码 colocate；不得（MUST NOT）建立顶层 `types/`、`services/`、`utils/` 目录。目录调整不得（MUST NOT）改变 package `exports`、公开 declarations 或运行时行为。Framework package 的 `test-utils/` 可以（MAY）作为非导出测试辅助存在。

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
`@xunserver-jsf/validator-ajv`必须（SHALL）作为`@xunserver-jsf/core` Validator Adapter协议的叶子实现持有AJV生产依赖，并且只能沿既有`@xunserver-jsf/validator-ajv -> @xunserver-jsf/core`产品依赖边消费公共契约。`@xunserver-jsf/core`及Vue、React、Element Plus 与 UI Adapter package不得（MUST NOT）直接依赖、导入或在公共declaration中引用AJV类型；Core validation行为必须（MUST）在没有AJV package时仍可构建和类型检查。

#### Scenario: validator-ajv合法依赖AJV与Core
- **GIVEN** `@xunserver-jsf/validator-ajv` manifest声明AJV和`@xunserver-jsf/core`，源码只从Core受支持入口导入协议
- **WHEN** 运行workspace build、typecheck和boundary checks
- **THEN** package成功构建且既有产品依赖方向保持不变

#### Scenario: 拒绝Core或Renderer导入AJV
- **GIVEN** Core或任一framework/UI package直接import AJV或在公共类型中暴露AJV `ErrorObject`
- **WHEN** 运行Core independence、declaration和architecture checks
- **THEN** 检查失败并指出违规package、import或declaration边界

### Requirement: Vue 与 Element Plus 只暴露受支持 Renderer 入口
`@xunserver-jsf/vue` 根入口必须（SHALL）暴露 Vue Renderer components、readonly composables、VueUIAdapter/RendererEnvironment authoring与diagnostic contracts；`@xunserver-jsf/element-plus` 根入口必须（SHALL）暴露标准 Element Plus adapter及显式组合/扩展入口。两包的 export map必须（MUST）拒绝未声明 deep import，并不得（MUST NOT）从公共 declarations 泄漏 Core mutable internals、Element Plus private types、React/Ant Design协议或 Universal Renderer抽象。

#### Scenario: 应用从根入口组合 Renderer
- **GIVEN** consumer从 `@xunserver-jsf/vue` 导入 `FormRenderer` 和 Vue adapter contracts，并从 `@xunserver-jsf/element-plus` 导入标准 adapter
- **WHEN** 使用 `<FormRenderer :form="form" :adapter="elementPlusAdapter" />` 类型检查
- **THEN** import与组件props成立且不需要Core/internal或package deep path

#### Scenario: deep import 与跨框架类型被拒绝
- **GIVEN** consumer尝试导入 Vue内部subscription/store writer、Element Plus内部mapper，或从两包取得React/Ant Design binding
- **WHEN** 按package exports与declarations解析
- **THEN** import失败，批准的根入口仍可独立使用

### Requirement: Vue/Element Plus 依赖与集成验收可重复验证
`@xunserver-jsf/vue` 必须（MUST）只沿产品边依赖 `@xunserver-jsf/core` 并把 Vue列为peer；`@xunserver-jsf/element-plus` 必须（MUST）只沿产品边依赖 `@xunserver-jsf/vue`/`@xunserver-jsf/core` 并把 Vue与Element Plus列为peer。仓库验证必须（MUST）包含不依赖具体UI library的headless Vue Renderer contract tests、Element Plus adapter integration tests，以及 `examples/playground` 中使用同一Definition/Plugin/Compiled Model的 Vue + Element Plus 预览；这些验收不得（MUST NOT）要求或导入React/Ant Design实现。

#### Scenario: headless adapter验证 Renderer契约
- **GIVEN** 测试提供一个记录调用的最小VueUIAdapter和事务Runtime
- **WHEN** 覆盖View遍历、精确订阅、hidden卸载、array move、cleanup与SSR
- **THEN** 测试无需Element Plus即可证明Renderer边界，且没有Schema/Rule/Validation解释或直接value写入

#### Scenario: Element Plus example完成端到端交互
- **GIVEN** playground 与 integration tests 编译并实例化含嵌套object/array、动态visible、validation与九类Widget的Definition
- **WHEN** Vue + Element Plus renderer执行输入、blur、array move与submit流程
- **THEN** UI只通过semantic commands更新Core，identity/presentable errors/ARIA正确，workspace build/typecheck/test/boundary checks均通过

### Requirement: React 与 UI adapter 渲染包只公开受支持入口
`@xunserver-jsf/react` 根入口必须（MUST）公开 React renderers、readonly hooks、`ReactUIAdapter` 与 `ReactRendererEnvironment` 的创建/组合契约及结构化 diagnostics。Ant Design、shadcn 等 UI adapter 通过各自根入口公开冻结 adapter（或 factory）及其受支持的组合/扩展入口。内部 Context、component factories、registry storage、mapper helpers 与 UI library implementation types 不得（MUST NOT）成为可依赖 deep import；`RenderScope`/`InstanceBinding` 等 Core-owned共享类型必须（MUST）从其 Core owning 入口导入，React包只消费而不得重新定义或建立第二个owner。

#### Scenario: 消费者只使用根入口
- **GIVEN** 外部应用使用 TypeScript NodeNext 编译 React+shadcn 表单
- **WHEN** 它从 `@xunserver-jsf/react` 与 `@xunserver-jsf/shadcn` 根入口导入公开 API
- **THEN** declarations 与 runtime exports 一致且无需 deep import

#### Scenario: 内部模块不可跨包导入
- **GIVEN** 消费者或 `@xunserver-jsf/shadcn` 尝试导入 `@xunserver-jsf/react` 未导出的内部 Context/registry 文件
- **WHEN** package exports resolution 执行
- **THEN** 该 deep import 不可解析，而受支持公开 adapter types 可从根入口解析

### Requirement: React 与 UI adapter 依赖方向保持单向
`@xunserver-jsf/react` 必须（MUST）只依赖 `@xunserver-jsf/core` 并把 React 声明为兼容 peer；`@xunserver-jsf/antd` / `@xunserver-jsf/shadcn` 必须（MUST）只依赖 `@xunserver-jsf/core`、`@xunserver-jsf/react` 并把各自宿主要求声明为兼容 peer（shadcn 仅 `react`）。React、React DOM、Ant Design 等 host runtime 不得（MUST NOT）被打包进库产物，Core 不得（MUST NOT）新增 React/UI library/DOM 依赖；默认 adapter 不得（MUST NOT）强制依赖日期对象库。

#### Scenario: manifest 与产物边界通过
- **GIVEN** workspace 构建 `@xunserver-jsf/react` 与 `@xunserver-jsf/shadcn`
- **WHEN** manifest-policy、bundle/external 与 dependency-boundary 检查运行
- **THEN** 依赖方向符合白名单，host peers 保持 external，`@xunserver-jsf/core` 仍可在无 DOM/React/UI library 环境导入

#### Scenario: React renderer 可 headless 测试
- **GIVEN** 测试只提供 React、Core 与一个无 UI library 的 fake ReactUIAdapter
- **WHEN** 渲染 resolved ViewTree 并驱动语义交互
- **THEN** `@xunserver-jsf/react` 不要求 Ant Design、Vue、Element Plus、shadcn 组件或浏览器 validation store 即可工作

### Requirement: React 与 UI adapter 提供完整集成验收入口
Workspace 必须（MUST）包含 React headless contract、StrictMode subscription cleanup、SSR/hydration、Ant Design / shadcn 九种 Widget/codec/props/ARIA/layout 集成测试。公开消费者示例是 `examples/playground`（含独立 shadcn 预览帧）；React 端到端行为由 integration tests 覆盖。跨栈验收必须（MUST）复用与 Vue/Element Plus 相同的 Core Definition/Plugin fixture 来比较 values、identity、effective state、validation 与 submit 结果，但不得（MUST NOT）让 React/UI 包导入 Vue 协议或建立 Universal Renderer。

#### Scenario: React+Ant Design 示例覆盖端到端行为
- **GIVEN** integration tests 编译并实例化含嵌套 object/array、动态 visible、validation 与九种 Widget 的 Definition
- **WHEN** 用户编辑、重排、blur、验证并提交
- **THEN** UI 只经公开 semantic APIs 改变同一 Core truth，且 build、typecheck 与 integration tests 通过

#### Scenario: SSR 与浏览器集成均受覆盖
- **GIVEN** 同一 React fixture 可在 server renderer 和浏览器测试环境运行
- **WHEN** 执行 render-to-string、hydrate、StrictMode remount 与后续 commit
- **THEN** 初始 markup 一致、订阅无泄漏且 selector 精准更新契约持续成立

#### Scenario: React+shadcn 示例覆盖端到端行为
- **GIVEN** playground shadcn 预览帧与 integration tests 编译并实例化含嵌套 object/array、动态 visible、validation 与九种 Widget 的 Definition
- **WHEN** 用户编辑、重排、blur、验证并提交
- **THEN** UI 只经公开 semantic APIs 改变同一 Core truth，且 build、typecheck 与 integration tests 通过

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
完整 v1 门禁必须（MUST）复用并加强既有产品依赖 allowlist：`@xunserver-jsf/core` 保持无产品依赖，`@xunserver-jsf/validator-ajv`、`@xunserver-jsf/vue`、`@xunserver-jsf/react` 只指向 Core，UI library package只指向各自 Renderer与Core；Vue、React及UI libraries继续作为对应集成包的 peer，AJV只属于 validator package。Example与test所需host dependencies可以（MAY）位于非发布工作区，但不得（MUST NOT）改变 package产物、declaration或产品依赖图。

#### Scenario: 测试宿主依赖不污染发布包
- **GIVEN** playground 与 SSR/browser tests安装Vue、React、Element Plus、Ant Design、AJV及测试宿主
- **WHEN** 检查产品 package 的manifest、构建产物与declarations
- **THEN** host libraries只出现在允许位置且保持external，Core与另一framework链路不获得传递产品依赖

#### Scenario: MUI X 或跨框架依赖被拒绝
- **GIVEN** 默认 Ant Design adapter引入日期对象库或未批准的日期选择器包，或任一React/Vue链路导入另一framework/UI library package
- **WHEN** 执行v1 dependency和bundle检查
- **THEN** gate失败并定位不在allowlist中的dependency/import，不能以example能够运行作为豁免

### Requirement: TypeDoc 与文档站保持非产品依赖
根工作区必须（SHALL）提供 TypeDoc 生成命令，并在 `docs:dev` 与 `site:build` 中先于 VitePress 运行。`typedoc` 及其 Markdown/VitePress 插件必须（MUST）只出现在根 `devDependencies`，不得（MUST NOT）进入产品 package 依赖图或 `verify:v1` 门禁。

#### Scenario: 文档生成命令不进入 v1 门禁
- **GIVEN** 根 `package.json` 脚本与 `verify:v1` 命令图
- **WHEN** 检查 TypeDoc 与 VitePress 相关脚本
- **THEN** 存在独立的 API 生成脚本，且 `verify:v1` 不调用 TypeDoc 或 `docs:build`

### Requirement: Playground 编辑器 chrome 隔离于产品依赖与预览帧
公开消费者示例 `examples/playground` 的编辑器页可以（MAY）使用 React、shadcn/ui、Tailwind、Monaco 与可访问拖拽库作为非发布工作台 chrome。这些宿主依赖必须（MUST）仅出现在 `@xunserver-jsf/example-playground`（或同等非发布 example），不得（MUST NOT）进入产品 package 的 manifest、产物或依赖 allowlist，也不得（MUST NOT）成为 `@xunserver-jsf/shadcn` 或任何 UI Adapter 的实现源。编辑器页的全局样式与拖拽 overlay 必须（MUST）不得污染 Element Plus / Ant Design / shadcn 预览 iframe 的文档样式或事件上下文。`examples/shared` 必须（MUST）保持框架与 DOM 无关，继续提供 catalog、workbench 编译、controller、`form-playground-v1` 协议，以及可视化 authoring 文档的纯转换与诊断；React 组件、DOM event、拖拽 sensor 和浏览器下载 API 只能（MUST）由 playground chrome 持有。

#### Scenario: Playground typecheck 允许 chrome 宿主依赖但不污染产品包
- **GIVEN** 一个已安装依赖的工作区，`examples/playground` 声明 React、shadcn 相关 UI 依赖、Monaco 与拖拽依赖
- **WHEN** 运行 playground 与 shared 的 typecheck，并检查产品 package 的 manifest 与依赖 allowlist
- **THEN** example typecheck 通过，产品 package 不获得 shadcn/Tailwind/Monaco/拖拽产品依赖，且 `@xunserver-jsf/example-shared` 不依赖 React、shadcn、Monaco、DOM 或拖拽实现

#### Scenario: 预览 iframe 不加载编辑器 Tailwind
- **GIVEN** playground 编辑器页已引入 Tailwind/shadcn 全局样式并挂载拖拽 provider/overlay
- **WHEN** 打开全部预览 iframe 入口并检查其文档样式与事件上下文
- **THEN** 预览页只加载预览宿主所需 CSS 与交互实现，不导入编辑器 Tailwind/shadcn 样式或拖拽 provider，既有 UI Adapter 外观与输入事件不受编辑器 chrome 影响

#### Scenario: Monaco 编辑五个 workbench 文档且协议保持
- **GIVEN** 用户在编辑器页打开 playground
- **WHEN** 用户在可视化模式生成 Schema/UI Schema，切回 `schema` / `uiSchema` / `rules` / `config` / `formData` Monaco 标签并继续编辑，随后广播到预览帧
- **THEN** 两种模式共享同一 `WorkbenchDocument` 与诊断结果，`createPlaygroundController` 和 `form-playground-v1` 仍驱动各预览独立 `createForm`，Inspector 焦点行为保持可用

#### Scenario: shared 转换可在无 DOM 环境测试
- **GIVEN** `examples/shared` 包含可视化 authoring 文档与 Schema/UI Schema 转换
- **WHEN** 在 Node.js test 环境运行转换、导入和诊断测试
- **THEN** 测试无需 React、DOM、拖拽 sensor、Clipboard 或下载 API 即可完成，转换结果可被 playground chrome 直接消费

### Requirement: Playground 可以按可配置 base 做 production 构建
`examples/playground` 必须（MUST）提供 production 构建命令，使其静态产物可挂在 GitHub Pages 的 `/playground/` 子路径。构建 `base` 必须（MUST）可通过环境变量覆盖，本地开发缺省仍为 `/`。预览 iframe href 必须（MUST）使用相对路径（例如 `element-plus.html`），不得（MUST NOT）使用会在 project site 上解析到错误根路径的绝对路径（例如 `/element-plus.html`）。VitePress 与站点拼接脚本必须（MUST）仅作为非发布工作区依赖/命令存在，不得（MUST NOT）进入产品 package 的 manifest、产物或依赖 allowlist。

#### Scenario: 本地开发仍使用根路径
- **GIVEN** 未设置 playground base 环境变量
- **WHEN** 启动 `pnpm playground`
- **THEN** 开发服务器仍在 `http://127.0.0.1:5173/` 提供编辑器页与三个相对路径预览 HTML

#### Scenario: production 构建使用子路径 base
- **GIVEN** 设置 `PLAYGROUND_BASE=/json-schema-form/playground/`
- **WHEN** 运行 playground production 构建
- **THEN** 产物资源 URL 带该 base，且三个预览 HTML 仍能通过相对 href 从编辑器页加载

#### Scenario: 文档工具不进入产品依赖图
- **GIVEN** 根工作区声明文档站构建依赖与 `site:build` 命令
- **WHEN** 检查产品 package 的 manifest 与依赖 allowlist
- **THEN** 产品 package 不获得 VitePress 或其他文档站依赖，FIRST_PARTY allowlist 保持不变

