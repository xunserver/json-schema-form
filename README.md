# JSON Schema Form

以 JSON Schema 为数据契约的表单引擎。同一份 Form Definition 可驱动 Vue 与 React，并提供 Element Plus、Ant Design、Arco Vue、Arco React、shadcn 适配器。Core 负责定义、静态编译、事务 Runtime 与校验；UI Adapter 只负责外观。

- 文档：https://xunserver.github.io/json-schema-form/
- Playground：https://xunserver.github.io/json-schema-form/playground/

产品 package 以 `@xunserver-jsf/*` 发布到 npm。安装示例见 [快速开始](https://xunserver.github.io/json-schema-form/guide/getting-started.html)。发布流程见 [`docs/release.md`](docs/release.md)。

架构基线见 [`docs/architecture.md`](docs/architecture.md)。工作区命令、package 职责、公共 export 规则以及 `packages/core/src` 的领域目录见 [`docs/workspace.md`](docs/workspace.md)。用户文档源在 [`docs/pages`](docs/pages)。

仓库 Settings → Pages → Source 必须选择 GitHub Actions。若 GitHub 仓库名不是 `json-schema-form`，改 `.github/workflows/pages.yml` 中的 `DOCS_BASE`。本地预览文档用 `pnpm docs:dev`；拼接静态站点用 `pnpm site:build`。

## 首期 package

| Package | 职责 |
|---|---|
| `@xunserver-jsf/core` | 框架无关的 Definition、静态编译、Compiled Model、事务化 Runtime、Diagnostic、`defineForm()` / `compileForm()` / `createForm()` 与 Extension Environment |
| `@xunserver-jsf/validator-ajv` | Draft 2020-12 Schema Validator Adapter；首期唯一允许引入 AJV 的 package |
| `@xunserver-jsf/vue` | Vue Renderer 边界，只依赖 Core 与 Vue peer |
| `@xunserver-jsf/react` | React Renderer 边界，只依赖 Core 与 React peer |
| `@xunserver-jsf/element-plus` | Element Plus UI Adapter 边界，位于 Vue Renderer 之上 |
| `@xunserver-jsf/antd` | Ant Design UI Adapter 边界，位于 React Renderer 之上 |
| `@xunserver-jsf/arco-vue` | Arco Design Vue UI Adapter 边界，位于 Vue Renderer 之上 |
| `@xunserver-jsf/arco-react` | Arco Design React UI Adapter 边界，位于 React Renderer 之上 |
| `@xunserver-jsf/shadcn` | shadcn UI Adapter 边界（消费方注入组件），位于 React Renderer 之上 |

## 允许的依赖方向

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

`@xunserver-jsf/core` 不得依赖 Vue、React、DOM UI library 或 AJV。Vue/React 与 UI library 只作为对应集成 package 的 peer dependency。

## 常用命令

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm check:boundaries
pnpm check:v1-matrix
pnpm verify
pnpm verify:v1
pnpm changeset
pnpm pack:check
pnpm playground
pnpm docs:api
pnpm docs:dev
pnpm site:build
```

`pnpm verify` 按依赖顺序构建全部 package，并执行类型检查、契约测试与跨 package 边界检查。`pnpm verify:v1` 是架构第 3/16–21 节的发布门禁：先核对 coverage matrix 与 prerequisite，再跑边界、build/typecheck/unit、跨栈集成、SSR/browser/playground 与文档证据。本地 `verify:v1` **不会**删除或重装开发者 workspace；干净 checkout 由 CI 执行 `pnpm install --frozen-lockfile` 后再跑同一门禁。覆盖索引见 [`docs/generated/v1-coverage.md`](docs/generated/v1-coverage.md)。npm 发布见 [`docs/release.md`](docs/release.md)。

### Playground 工作台

`pnpm playground` 启动 `examples/playground` 里的单个 Vite 多页面工作台（http://127.0.0.1:5173/）：

- `index.html`：左侧 Monaco JSON 编辑器与 Inspector（React + shadcn 工作台 chrome）
- `element-plus.html` / `antd.html` / `arco-vue.html` / `arco-react.html` / `shadcn.html`：右侧 Adapter Tab 预览（各 iframe 同时挂载并持续渲染，Tab 只切换可见帧与 Inspector 焦点）

左侧可编辑 `schema` / `uiSchema` / `rules` / `config` / `formData`；四个预览页各自独立 `createForm`。切换右侧 Adapter Tab 设焦点后，Inspector 显示该帧的 live values / `serialize()` / submit；已打开过的预览帧保持挂载。共享例子与编译管线在 `examples/shared`。playground 的 shadcn 组件仅用于工作台 chrome，不是表单 Widget 源，也不构成 `@xunserver-jsf/shadcn` adapter。

公开入口：`@xunserver-jsf/core`、`@xunserver-jsf/core/runtime`、`@xunserver-jsf/core/extension`，以及各 Renderer/Adapter package 的根入口。未声明 deep import 会被拒绝。浏览器/Worker 宿主测试依赖根目录 dev-only `playwright`，不会进入发布 package。架构第 20 节列出的八项能力（完整 JSON Schema 自动 UI、运行时改 Model、async rule / 内置远程 DataSource、万能 hooks、独立 nested store、DevTools mutable graph、compiler/runtime 拆包、一次性全 UI Adapter）保持 deferred / optional-unsupported，不作为 v1 产品 API。

## 用法与架构

面向使用者的文档站按「使用 → 定制 → 概念 → API」组织：

- 使用 / 定制 / 概念：https://xunserver.github.io/json-schema-form/
- TypeDoc API：https://xunserver.github.io/json-schema-form/api/
- 本地：`pnpm docs:api` 后 `pnpm docs:dev`

实现语义、不变量与公共 API 分层仍以 [`docs/architecture.md`](docs/architecture.md) 为准，不要把用户站当成架构基线。
