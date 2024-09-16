# 工作区与公共边界

本文记录仓库级命令、首期 package 的职责、允许的依赖图、`@xunserver-jsf/core` 公共入口，以及新增公共 export 的规则。包边界、依赖方向和架构不变量以 [`architecture.md`](./architecture.md) 为准；本文只描述当前工作区如何执行这些约定。

## 工作区命令

| 命令 | 作用 |
|---|---|
| `pnpm install` | 安装工作区依赖。发布校验使用 `pnpm install --frozen-lockfile`。 |
| `pnpm build` | 按 TypeScript project references 构建全部 package，产出 ESM 与 declaration。 |
| `pnpm typecheck` | 构建期类型检查，外加 Core 内部 type-test 与消费者正向契约检查。 |
| `pnpm test` | 运行 unit、type-contract、export-isolation、Core-independence 与 fault-injection 测试。 |
| `pnpm check:boundaries` | 用 TypeScript parser/module resolution 校验 manifest 与源码 import 是否符合规范依赖图。 |
| `pnpm check:v1-matrix` | 校验 `tests/architecture/v1-coverage.json` 与 `docs/architecture.md` digest、owner/test/command 映射。 |
| `pnpm check:v1-workspace` | 核对全部 package、playground/shared examples、顶层 tests/docs 与第 18 节领域目录。 |
| `pnpm test:v1:integration` | 共享 fixture 的跨能力 headless 与两栈集成。 |
| `pnpm test:v1:host` | 真实 Chromium / Worker / SSR / playground typecheck。需要先 `pnpm exec playwright install chromium --with-deps`。 |
| `pnpm test:v1:docs` | README、workspace、generated coverage 与 deferred 声明审计。 |
| `pnpm verify` | `build && typecheck && test && check:boundaries`。 |
| `pnpm verify:v1` | 架构 v1 发布门禁。本地不重装依赖；证据写入 `artifacts/v1/`（该目录已 gitignore）。 |
| `pnpm changeset` | 记录一次产品包版本变更；九个 `@xunserver-jsf/*` 产品包固定同一版本。 |
| `pnpm pack:check` | 构建后对产品包执行 `npm pack --dry-run`，检查将上传的 tarball 内容。 |
| `pnpm release` | `changeset publish`。CI 在 `verify:v1` 通过后调用。账号与 Trusted Publishing 见 [`release.md`](./release.md)。 |
| `pnpm playground` | 启动单 Vite MPA 工作台（http://127.0.0.1:5173/）：React + shadcn + Monaco 编辑器，右侧 Adapter Tab 对照 Element Plus / Ant Design / Arco Vue / Arco React / shadcn。 |
| `pnpm docs:dev` | 启动 VitePress 用户文档站（`docs/pages`）。贡献者 `architecture.md` / `workspace.md` / `generated/` 不进入该站点。 |
| `pnpm docs:build` | 构建 VitePress 静态产物到 `docs/.vitepress/dist`。`DOCS_BASE` 默认 `/json-schema-form/`。 |
| `pnpm site:build` | 构建产品 package、文档站与 playground，并把 playground 拼到文档产物的 `/playground/`，供 GitHub Pages 发布。不包含在 `verify:v1` 中。 |

根 package 为 private，并通过 `packageManager` 固定 pnpm。共享语言设置在 `tsconfig.base.json`；各 package 使用自己的 composite project，不使用会绕过 package exports 的根级 `paths` alias。pnpm 11 需要在 `pnpm-workspace.yaml` 中允许 `esbuild` 的 `allowBuilds`，否则 vitest/tsx 无法安装其原生绑定。

## 首期 package

| Package | 目录 | 职责 | 当前公共表面 |
|---|---|---|---|
| `@xunserver-jsf/core` | `packages/core` | 框架无关的 authoring、静态编译与事务化 Runtime；提供 Extension Plugin/Environment | Path、ID、Diagnostic、Form Definition、`defineForm()`、`compileForm()`、`createForm()` / `createFormEngine()`、Compiled Model、CompileResult/CompileError、`FormInstance` / `ArrayInstance` / `ScopedFormInstance`、Rule AST / effective state（含 `required`）/ View source state（`focused`/`collapsed`/`activeTab`）/ `blur()` `setCollapsed()` `setActiveTab()` / `serialize()` / `validate()` / `applyErrors()` / `submit()` / `FormConfig.valueInitializer`；`@xunserver-jsf/core/runtime` 导出只读 selector/subscription（含 `effectiveStateSelector`、`presentableErrorSelector`、`InstanceBinding`、`RenderScope`、`getRenderScope()`）与 array identity resolver；`@xunserver-jsf/core/extension` 导出 Plugin/Environment/Widget/Registry 契约、`defineWidget()`、`defineRuleFunction()`、`defineValidator()`、`SchemaDialectDefinition` / `SchemaExtensionDefinition` / `ValueInitializerDefinition` 与 factory |
| `@xunserver-jsf/validator-ajv` | `packages/validator-ajv` | Draft 2020-12 Schema Validator Adapter | `createAjvValidator()` / `AJV_VALIDATOR_KEY`；生产依赖 `ajv` 与 `@xunserver-jsf/core` |
| `@xunserver-jsf/vue` | `packages/vue` | Vue Renderer 边界 | `FormRenderer` / `ViewRenderer` / `FieldRenderer`、readonly composables、`defineVueUIAdapter()` / `createVueRendererEnvironment()` 与 adapter diagnostics；peer 为 `vue` |
| `@xunserver-jsf/react` | `packages/react` | React Renderer 边界 | `FormRenderer` / `ViewRenderer` / `FieldRenderer`、readonly hooks、`defineReactUIAdapter()` / `createReactRendererEnvironment()` 与 adapter diagnostics；peer 为 `react` |
| `@xunserver-jsf/element-plus` | `packages/adapter/element-plus` | Element Plus Adapter 边界 | `elementPlusAdapter` / `createElementPlusAdapter()` / `extendElementPlusAdapter()`；依赖 `@xunserver-jsf/vue` 与 `@xunserver-jsf/core`，peer 为 `vue` 与 `element-plus` |
| `@xunserver-jsf/antd` | `packages/adapter/antd` | Ant Design Adapter 边界 | `antdAdapter` / `createAntdAdapter()` / `extendAntdAdapter()`；依赖 `@xunserver-jsf/react` 与 `@xunserver-jsf/core`，peer 为 `react` 与 `antd` |
| `@xunserver-jsf/arco-vue` | `packages/adapter/arco-vue` | Arco Design Vue Adapter 边界 | `arcoVueAdapter` / `createArcoVueAdapter()` / `extendArcoVueAdapter()`；依赖 `@xunserver-jsf/vue` 与 `@xunserver-jsf/core`，peer 为 `vue` 与 `@arco-design/web-vue` |
| `@xunserver-jsf/arco-react` | `packages/adapter/arco-react` | Arco Design React Adapter 边界 | `arcoReactAdapter` / `createArcoReactAdapter()` / `extendArcoReactAdapter()`；依赖 `@xunserver-jsf/react` 与 `@xunserver-jsf/core`，peer 为 `react` 与 `@arco-design/web-react` |
| `@xunserver-jsf/shadcn` | `packages/adapter/shadcn` | shadcn UI Adapter 边界（组件由消费方注入） | `createShadcnAdapter({ components })` / `extendShadcnAdapter()`；依赖 `@xunserver-jsf/react` 与 `@xunserver-jsf/core`，peer 仅 `react` |

叶子 package 中 `@xunserver-jsf/vue` / `@xunserver-jsf/element-plus` / `@xunserver-jsf/arco-vue` 与 `@xunserver-jsf/react` / `@xunserver-jsf/antd` / `@xunserver-jsf/arco-react` / `@xunserver-jsf/shadcn` 分别提供框架渲染链路。`@xunserver-jsf/core` 已提供 `defineForm()`、`compileForm()` 静态编译（含 Rule AST 与 Schema Dynamics）、事务 Runtime、array identity / `array()` / `scope()`、`blur()` / `setCollapsed()` / `setActiveTab()`、`RenderScope` / `InstanceBinding`、effective state（含 `required`）、`serialize()` 以及 Validation owner（`validate()` / `applyErrors()` / `submit()`）。AJV 只允许出现在 `@xunserver-jsf/validator-ajv`。可浏览 playground 在 `examples/playground`（共享 catalog 在 `examples/shared`），复用 `tests/fixtures/v1/` 的业务 Definition/Plugin。用户文档站源在 [`pages/`](./pages/index.md)；Renderer 用法见该站点的 Vue / React 页面，仓库内 [`vue-element-plus.md`](./vue-element-plus.md) 等仅为短链。GitHub Pages 把文档放在站点根路径、playground 放在 `/playground/`；Pages source 必须设为 GitHub Actions。第 20 节 deferred 项不得作为产品入口出现。

## 允许的依赖图

产品依赖只允许以下边，与架构文档第 17 节一致：

```text
@xunserver-jsf/validator-ajv ------> @xunserver-jsf/core
@xunserver-jsf/vue ----------------> @xunserver-jsf/core
@xunserver-jsf/react --------------> @xunserver-jsf/core
@xunserver-jsf/element-plus -------> @xunserver-jsf/vue + @xunserver-jsf/core
@xunserver-jsf/antd ---------------> @xunserver-jsf/react + @xunserver-jsf/core
@xunserver-jsf/arco-vue -----------> @xunserver-jsf/vue + @xunserver-jsf/core
@xunserver-jsf/arco-react ---------> @xunserver-jsf/react + @xunserver-jsf/core
@xunserver-jsf/shadcn -------------> @xunserver-jsf/react + @xunserver-jsf/core
```

强制规则：

- 禁止反向依赖，例如 `@xunserver-jsf/core` 依赖 `@xunserver-jsf/vue`。
- 禁止跨框架依赖，例如 `@xunserver-jsf/antd` 依赖 `@xunserver-jsf/vue` 或 `@xunserver-jsf/element-plus`。
- 禁止未声明的 `@xunserver-jsf/*` import，以及跨 package 的 relative import。
- `@xunserver-jsf/core` 的依赖图和源码 import 不得包含 Vue、React、AJV、Element Plus、Ant Design。
- 宿主框架和 UI library 只能出现在对应集成 package 的 `peerDependencies` 中，不能放入会被打包的 `dependencies`。
- Core production TypeScript project 只启用 ECMAScript `lib`，不包含 DOM 或 test runner ambient types。

这些规则由 `tools/architecture-check` 的单一 allowlist 同时检查 manifest 与源码 import。

## Core 公共入口

`@xunserver-jsf/core` 只通过 package `exports` 暴露三个入口：

| 入口 | 用途 |
|---|---|
| `@xunserver-jsf/core` | Application 契约：Path、公共 ID、Diagnostic、FormDefinition、`defineForm()`、`compileForm()` / `CompileOptions`、`createForm()` / `createFormEngine()`、FormInstance/FieldInstance/ArrayInstance/ScopedFormInstance、CompiledFormModel、CompileResult、CompileError、`FormRuntimeError`、RuleExpression、EffectiveState（含 `required`）、View source state（`focused`/`collapsed`/`activeTab`）、`blur()`/`setCollapsed()`/`setActiveTab()`、`serialize()`、`validate()`/`applyErrors()`/`submit()`、`ValidationError` |
| `@xunserver-jsf/core/runtime` | Advanced Runtime API：只读 selector factory（含 array order/item/binding、`effectiveStateSelector`、`presentableErrorSelector`）、`InstanceBinding`、`RenderScope`、`getRenderScope()`、`createSelector()`、snapshot read、subscription、Identity Resolver 类型与 Runtime diagnostic observation |
| `@xunserver-jsf/core/extension` | Extension API：`definePlugin()`、`defineWidget()`、`defineRuleFunction()`、`defineValidator()`、`createFormEnvironment()`、只读 Registry/Widget/Plugin/RuleFunction/Serializer/Validator/`SchemaDialectDefinition`/`SchemaExtensionDefinition`/`ValueInitializerDefinition` 与 Widget interaction 契约、protocol constant 与 `EnvironmentBuildError` |

根入口导出的是面向应用的只读契约与基础实例 factory，不导出 `RuntimeNodeId`、TransactionManager、ChangeQueue、CompilerContext、RuleEngine/DependencyScheduler、AST evaluator、可变 Store、ArrayStateStore、View state store、interaction event writer、binding table、Environment identity token、ValidationEngine/ErrorStore 或其他内部实现符号。未写入 `exports` 的 deep path 不是公共 API。`setValues()` 是 root replacement。数组 index 不是身份；结构变化走 `ArrayInstance`，越界 index 不能隐式创建 item。Identity Resolver 必须是纯同步函数，且只从 `@xunserver-jsf/core/runtime` 取得类型。`RenderScope` / `InstanceBinding` / `getRenderScope()` 只从 `@xunserver-jsf/core/runtime` 导出，根入口不重导出。`reset()` 会重建 array identity 并恢复 `focused`/`collapsed`/`activeTab` 默认值。固定 tuple 不支持 list 结构命令。AJV instance 与 Adapter factory 只从 `@xunserver-jsf/validator-ajv` 取得。Core 不渲染 UI；两条 Renderer 链路分别由 `@xunserver-jsf/vue` + `@xunserver-jsf/element-plus` 与 `@xunserver-jsf/react` + `@xunserver-jsf/antd` 交付。`SchemaDialectDefinition` / `SchemaExtensionDefinition` / `ValueInitializerDefinition` 只从 `@xunserver-jsf/core/extension` 导出；根入口只新增 `FormConfig.valueInitializer` 与 `CreateFormOptions.valueInitializer` 两个 string key。Core 不附带内置 dialect adapter 或 `x-*` 词汇。

## Core 内部目录

`packages/core/src/` 按架构第 18 节的生命周期领域组织，由 `pnpm check:boundaries` 的 `core-layout` 规则强制：

```text
definition/   schema/   compiler/{schema,shape,data,ui,rule,validation,dynamics}
model/{data,ui,rule,validation,schema-dynamics,path,identity}
runtime/{form,value,state,transaction,array,dependency,subscription,scope,rule,validation,dynamics}
widget/   rule/   validation/   extension/   diagnostic/   engine/   index.ts
```

顶层不得出现 `types/`、`services/`、`utils/`。`path` / `identity` 编入 `model/`，Schema Dynamics 编译与 Runtime activation 分别编入 `compiler/dynamics` 与 `runtime/dynamics`，Rule/Validation 引擎编入 `runtime/rule` 与 `runtime/validation`，Engine/Environment 生命周期编入 `engine/`，内置 Widget 编入 `widget/`。领域内可有内部 `index.ts` 与局部 helper；package 公共表面仍只由三个 `exports` 入口决定。Vue/React 的 `test-utils/` 可作为非导出测试辅助存在。

Schema Frontend 消费点：`compiler/schema` 在 dialect detection 调用 `convert()`，在 Data Model 实例化后按 `SchemaPath -> ModelPath[]` 调用 `split()`，再把片段合并进 compiler 私有 effective authoring input（显式 UI Schema / Rules / Config 优先，重叠 key 只 warning）。Value Initializer 消费点：`compiler/rule` 校验 `FormConfig.valueInitializer` key，`runtime/form` 的 `createForm()` 在 identity materialization 之前执行 `initialize()`。

## 提出未来公共 export 的规则

新增或移动公共 export 必须作为独立变更提出，并同时更新：

1. 对应 package 的 `exports` map；未声明路径默认保持私有。
2. 架构文档第 16 节的导出层级，以及本文的入口表。
3. 消费者正向/负向契约 fixture，证明新入口可解析且内部模块仍然不可达。

约束：

- 不要使用 `./*` wildcard export。
- 不要从根入口重新导出内部 domain barrel。
- Core 公共契约必须保持框架无关，不得引入 Vue、React、DOM、UI library 或 AJV 类型。
- Compiled Model 必须保持只读，不得混入 FormInstance values 或可变 Runtime 状态。
- `RuntimeNodeId` 以及可变 Store、Scheduler、Compiler Context 不得进入任何公共入口。
- `defineWidget()` 与 `WidgetDefinition` interaction contract 只从 `@xunserver-jsf/core/extension` 导出；根入口不重导出。
- Field `requirement` presentation source 由静态编译投影；effective `required`、`blur()`、`setCollapsed()` / `setActiveTab()` 与 `RenderScope` / `InstanceBinding` / `getRenderScope()` 由 Core Runtime 交付。Vue/Element Plus 与 React/Ant Design Renderer 都只消费这些公开端口。
- 不要把 Plugin 可注册的 dialect adapter / `x-*` extension / value initializer 写成 Core 内置能力；也不要把本切片理解成 Validation pipeline 的实现来源。
