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
| `pnpm verify` | `build && typecheck && test && check:boundaries`。干净 checkout 的完整验收入口。 |

根 package 为 private，并通过 `packageManager` 固定 pnpm。共享语言设置在 `tsconfig.base.json`；各 package 使用自己的 composite project，不使用会绕过 package exports 的根级 `paths` alias。pnpm 11 需要在 `pnpm-workspace.yaml` 中允许 `esbuild` 的 `allowBuilds`，否则 vitest/tsx 无法安装其原生绑定。

## 六个首期 package

| Package | 目录 | 职责 | 当前公共表面 |
|---|---|---|---|
| `@form/core` | `packages/core` | 框架无关的 authoring、静态编译与事务化 Runtime；提供 Extension Plugin/Environment | Path、ID、Diagnostic、Form Definition、`defineForm()`、`compileForm()`、`createForm()` / `createFormEngine()`、Compiled Model、CompileResult/CompileError、`FormInstance`；`@form/core/runtime` 导出只读 selector/subscription；`@form/core/extension` 导出 Plugin/Environment/Widget/Registry 契约与 factory |
| `@form/validator-ajv` | `packages/validator-ajv` | 具体 JSON Schema validator 边界 | 空 ESM 入口；后续才允许引入 AJV |
| `@form/vue` | `packages/vue` | Vue Renderer 边界 | 空 ESM 入口；peer 为 `vue` |
| `@form/react` | `packages/react` | React Renderer 边界 | 空 ESM 入口；peer 为 `react` |
| `@form/element-plus` | `packages/element-plus` | Element Plus Adapter 边界 | 空 ESM 入口；依赖 `@form/vue` 与 `@form/core`，peer 为 `vue` 与 `element-plus` |
| `@form/mui` | `packages/mui` | MUI Adapter 边界 | 空 ESM 入口；依赖 `@form/react` 与 `@form/core`，peer 为 `react` 与 `@mui/material` |

叶子 package 目前只提供可构建的空边界。`@form/core` 已提供 `defineForm()`、`compileForm()` 静态编译，以及基础事务 Runtime；Rule/Validation/Array/Renderer 行为仍待后续切片。

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
| `@form/core` | Application 契约：Path、公共 ID、Diagnostic、FormDefinition、`defineForm()`、`compileForm()` / `CompileOptions`、`createForm()` / `createFormEngine()`、FormInstance/FieldInstance、CompiledFormModel、CompileResult、CompileError、`FormRuntimeError` |
| `@form/core/runtime` | Advanced Runtime API：只读 selector factory、`createSelector()`、snapshot read、subscription 与 Runtime diagnostic observation |
| `@form/core/extension` | Extension API：`definePlugin()`、`createFormEnvironment()`、只读 Registry/Widget/Plugin 契约、protocol constant 与 `EnvironmentBuildError` |

根入口导出的是面向应用的只读契约与基础实例 factory，不导出 `RuntimeNodeId`、TransactionManager、ChangeQueue、CompilerContext、Scheduler、可变 Store、Environment identity token 或其他内部实现符号。未写入 `exports` 的 deep path 不是公共 API。`setValues()` 是 root replacement；数组 index path 目前会返回 capability diagnostic，尚不创建数组项身份。

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
