# 工作区与公共边界

本文记录仓库级命令、六个首期 package 的职责、允许的依赖图、`@form/core` 公共入口，以及新增公共 export 的规则。包边界、依赖方向和架构不变量以 [`architecture.md`](./architecture.md) 为准；本文只描述当前工作区如何执行这些约定。

## 工作区命令

| 命令 | 作用 |
|---|---|
| `pnpm install` | 安装工作区依赖。发布校验使用 `pnpm install --frozen-lockfile`。 |
| `pnpm build` | 按 TypeScript project references 构建六个 package，产出 ESM 与 declaration。 |
| `pnpm typecheck` | 构建期类型检查，外加 Core 内部 type-test 与消费者正向契约检查。 |
| `pnpm test` | 运行 unit、type-contract、export-isolation、Core-independence 与 fault-injection 测试。 |
| `pnpm check:boundaries` | 用 TypeScript parser/module resolution 校验 manifest 与源码 import 是否符合规范依赖图。 |
| `pnpm check:v1-matrix` | 校验 `tests/architecture/v1-coverage.json` 与 `docs/architecture.md` digest、owner/test/command 映射。 |
| `pnpm check:v1-workspace` | 核对六个 package、两 examples、顶层 tests/docs 与第 18 节领域目录。 |
| `pnpm test:v1:integration` | 共享 fixture 的跨能力 headless 与两栈集成。 |
| `pnpm test:v1:host` | 真实 Chromium / Worker / SSR / examples smoke。需要先 `pnpm exec playwright install chromium --with-deps`。 |
| `pnpm test:v1:docs` | README、workspace、generated coverage 与 deferred 声明审计。 |
| `pnpm verify` | `build && typecheck && test && check:boundaries && example:vue && example:react`。 |
| `pnpm verify:v1` | 架构 v1 发布门禁。本地不重装依赖；证据写入 `artifacts/v1/`（该目录已 gitignore）。 |

根 package 为 private，并通过 `packageManager` 固定 pnpm。共享语言设置在 `tsconfig.base.json`；各 package 使用自己的 composite project，不使用会绕过 package exports 的根级 `paths` alias。pnpm 11 需要在 `pnpm-workspace.yaml` 中允许 `esbuild` 的 `allowBuilds`，否则 vitest/tsx 无法安装其原生绑定。

## 六个首期 package

| Package | 目录 | 职责 | 当前公共表面 |
|---|---|---|---|
| `@form/core` | `packages/core` | 框架无关的 authoring、静态编译与事务化 Runtime；提供 Extension Plugin/Environment | Path、ID、Diagnostic、Form Definition、`defineForm()`、`compileForm()`、`createForm()` / `createFormEngine()`、Compiled Model、CompileResult/CompileError、`FormInstance` / `ArrayInstance` / `ScopedFormInstance`、Rule AST / effective state（含 `required`）/ View source state（`focused`/`collapsed`/`activeTab`）/ `blur()` `setCollapsed()` `setActiveTab()` / `serialize()` / `validate()` / `applyErrors()` / `submit()` / `FormConfig.valueInitializer`；`@form/core/runtime` 导出只读 selector/subscription（含 `effectiveStateSelector`、`presentableErrorSelector`、`InstanceBinding`、`RenderScope`、`getRenderScope()`）与 array identity resolver；`@form/core/extension` 导出 Plugin/Environment/Widget/Registry 契约、`defineWidget()`、`defineRuleFunction()`、`defineValidator()`、`SchemaDialectDefinition` / `SchemaExtensionDefinition` / `ValueInitializerDefinition` 与 factory |
| `@form/validator-ajv` | `packages/validator-ajv` | Draft 2020-12 Schema Validator Adapter | `createAjvValidator()` / `AJV_VALIDATOR_KEY`；生产依赖 `ajv` 与 `@form/core` |
| `@form/vue` | `packages/vue` | Vue Renderer 边界 | `FormRenderer` / `ViewRenderer` / `FieldRenderer`、readonly composables、`defineVueUIAdapter()` / `createVueRendererEnvironment()` 与 adapter diagnostics；peer 为 `vue` |
| `@form/react` | `packages/react` | React Renderer 边界 | `FormRenderer` / `ViewRenderer` / `FieldRenderer`、readonly hooks、`defineReactUIAdapter()` / `createReactRendererEnvironment()` 与 adapter diagnostics；peer 为 `react` |
| `@form/element-plus` | `packages/element-plus` | Element Plus Adapter 边界 | `elementPlusAdapter` / `createElementPlusAdapter()` / `extendElementPlusAdapter()`；依赖 `@form/vue` 与 `@form/core`，peer 为 `vue` 与 `element-plus` |
| `@form/mui` | `packages/mui` | MUI Adapter 边界 | `muiAdapter` / `createMuiAdapter()` / `extendMuiAdapter()`；依赖 `@form/react` 与 `@form/core`，peer 为 `react` 与 `@mui/material` |

叶子 package 中 `@form/vue` / `@form/element-plus` 与 `@form/react` / `@form/mui` 分别提供两条框架渲染链路。`@form/core` 已提供 `defineForm()`、`compileForm()` 静态编译（含 Rule AST 与 Schema Dynamics）、事务 Runtime、array identity / `array()` / `scope()`、`blur()` / `setCollapsed()` / `setActiveTab()`、`RenderScope` / `InstanceBinding`、effective state（含 `required`）、`serialize()` 以及 Validation owner（`validate()` / `applyErrors()` / `submit()`）。AJV 只允许出现在 `@form/validator-ajv`。公开 example 为 `examples/vue-element-plus` 与 `examples/react-mui`，复用 `tests/fixtures/v1/` 的业务 Definition/Plugin。Renderer 用法见 [`vue-element-plus.md`](./vue-element-plus.md) 与 [`react-mui.md`](./react-mui.md)。第 20 节 deferred 项不得作为产品入口出现。

## 允许的依赖图

产品依赖只允许以下边，与架构文档第 17 节一致：

```text
@form/validator-ajv ------> @form/core
@form/vue ----------------> @form/core
@form/react --------------> @form/core
@form/element-plus -------> @form/vue + @form/core
@form/mui ----------------> @form/react + @form/core
```

强制规则：

- 禁止反向依赖，例如 `@form/core` 依赖 `@form/vue`。
- 禁止跨框架依赖，例如 `@form/mui` 依赖 `@form/vue` 或 `@form/element-plus`。
- 禁止未声明的 `@form/*` import，以及跨 package 的 relative import。
- `@form/core` 的依赖图和源码 import 不得包含 Vue、React、AJV、Element Plus、MUI。
- 宿主框架和 UI library 只能出现在对应集成 package 的 `peerDependencies` 中，不能放入会被打包的 `dependencies`。
- Core production TypeScript project 只启用 ECMAScript `lib`，不包含 DOM 或 test runner ambient types。

这些规则由 `tools/architecture-check` 的单一 allowlist 同时检查 manifest 与源码 import。

## Core 公共入口

`@form/core` 只通过 package `exports` 暴露三个入口：

| 入口 | 用途 |
|---|---|
| `@form/core` | Application 契约：Path、公共 ID、Diagnostic、FormDefinition、`defineForm()`、`compileForm()` / `CompileOptions`、`createForm()` / `createFormEngine()`、FormInstance/FieldInstance/ArrayInstance/ScopedFormInstance、CompiledFormModel、CompileResult、CompileError、`FormRuntimeError`、RuleExpression、EffectiveState（含 `required`）、View source state（`focused`/`collapsed`/`activeTab`）、`blur()`/`setCollapsed()`/`setActiveTab()`、`serialize()`、`validate()`/`applyErrors()`/`submit()`、`ValidationError` |
| `@form/core/runtime` | Advanced Runtime API：只读 selector factory（含 array order/item/binding、`effectiveStateSelector`、`presentableErrorSelector`）、`InstanceBinding`、`RenderScope`、`getRenderScope()`、`createSelector()`、snapshot read、subscription、Identity Resolver 类型与 Runtime diagnostic observation |
| `@form/core/extension` | Extension API：`definePlugin()`、`defineWidget()`、`defineRuleFunction()`、`defineValidator()`、`createFormEnvironment()`、只读 Registry/Widget/Plugin/RuleFunction/Serializer/Validator/`SchemaDialectDefinition`/`SchemaExtensionDefinition`/`ValueInitializerDefinition` 与 Widget interaction 契约、protocol constant 与 `EnvironmentBuildError` |

根入口导出的是面向应用的只读契约与基础实例 factory，不导出 `RuntimeNodeId`、TransactionManager、ChangeQueue、CompilerContext、RuleEngine/DependencyScheduler、AST evaluator、可变 Store、ArrayStateStore、View state store、interaction event writer、binding table、Environment identity token、ValidationEngine/ErrorStore 或其他内部实现符号。未写入 `exports` 的 deep path 不是公共 API。`setValues()` 是 root replacement。数组 index 不是身份；结构变化走 `ArrayInstance`，越界 index 不能隐式创建 item。Identity Resolver 必须是纯同步函数，且只从 `@form/core/runtime` 取得类型。`RenderScope` / `InstanceBinding` / `getRenderScope()` 只从 `@form/core/runtime` 导出，根入口不重导出。`reset()` 会重建 array identity 并恢复 `focused`/`collapsed`/`activeTab` 默认值。固定 tuple 不支持 list 结构命令。AJV instance 与 Adapter factory 只从 `@form/validator-ajv` 取得。Core 不渲染 UI；两条 Renderer 链路分别由 `@form/vue` + `@form/element-plus` 与 `@form/react` + `@form/mui` 交付。`SchemaDialectDefinition` / `SchemaExtensionDefinition` / `ValueInitializerDefinition` 只从 `@form/core/extension` 导出；根入口只新增 `FormConfig.valueInitializer` 与 `CreateFormOptions.valueInitializer` 两个 string key。Core 不附带内置 dialect adapter 或 `x-*` 词汇。

## Core 内部目录

`packages/core/src/` 按架构第 18 节的生命周期领域组织，由 `pnpm check:boundaries` 的 `core-layout` 规则强制：

```text
definition/   schema/   compiler/{schema,shape,data,ui,rule,validation}
model/{data,ui,rule,validation,schema-dynamics}
runtime/{form,value,state,transaction,array,dependency,subscription,scope}
widget/   rule/   validation/   extension/   diagnostic/   engine/   index.ts
```

顶层不得出现 `types/`、`services/`、`utils/`。`path` / `identity` 编入 `model/`，Engine/Environment 生命周期编入 `engine/`，内置 Widget 编入 `widget/`。领域内可有内部 `index.ts` 与局部 helper；package 公共表面仍只由三个 `exports` 入口决定。

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
- `defineWidget()` 与 `WidgetDefinition` interaction contract 只从 `@form/core/extension` 导出；根入口不重导出。
- Field `requirement` presentation source 由静态编译投影；effective `required`、`blur()`、`setCollapsed()` / `setActiveTab()` 与 `RenderScope` / `InstanceBinding` / `getRenderScope()` 由 Core Runtime 交付。Vue/Element Plus 与 React/MUI Renderer 都只消费这些公开端口。
- 不要把 Plugin 可注册的 dialect adapter / `x-*` extension / value initializer 写成 Core 内置能力；也不要把本切片理解成 Validation pipeline 的实现来源。
