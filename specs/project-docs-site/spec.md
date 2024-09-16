# project-docs-site Specification

## Purpose

为开源使用者提供可浏览的文档站点，并与 playground 静态产物一并发布到 GitHub Pages，使文档根路径与演练场子路径在同一站点上可访问。

## Requirements

### Requirement: 用户文档站点覆盖已交付用法
工作区必须（SHALL）提供面向使用者的静态文档站点。站点信息架构必须（MUST）按以下顺序组织：使用（安装与任务型 how-to）、定制阶梯、概念、由 TypeDoc 生成的公开 API。站点必须（MUST）覆盖 Vue / React Renderer 与全部已交付 Adapter，包括 `@xunserver-jsf/shadcn`。快速开始必须（MUST）给出可提交的完整示例（`defineForm` → `compileForm` → `createForm` → `FormRenderer`，并挂上同一 `FormEnvironment` 中的 AJV validator）。文档不得（MUST NOT）把架构第 20 节 deferred 能力或未交付 package（例如 `@xunserver-jsf/mui`）写成产品 API。贡献者基线 `docs/architecture.md`、`docs/workspace.md` 与 `docs/generated/` 必须（MUST）保留在仓库原路径，且不得（MUST NOT）作为用户站点页面发布。

#### Scenario: 文档站按使用、定制、概念、API 组织
- **GIVEN** 工作区已安装依赖并生成 API 文档
- **WHEN** 构建用户文档站点并检查导航与源页面
- **THEN** 站点包含首页、使用 how-to、定制阶梯、概念页、TypeDoc API 入口，以及 Vue/React 与五个 Adapter 页面，且产物中不包含 `architecture.md` / `workspace.md` / `generated/v1-coverage.md` 作为站点页面

#### Scenario: 文档不承诺 deferred API 但覆盖 shadcn
- **GIVEN** 用户文档源页面
- **WHEN** 检查产品用法描述
- **THEN** 页面描述已交付公开入口（含 `@xunserver-jsf/shadcn`），不把完整 JSON Schema 自动 UI、运行时改 Model 或 `@xunserver-jsf/mui` 写成可用产品 API

### Requirement: GitHub Pages 同时发布文档与 playground
同一 GitHub Pages 站点必须（SHALL）把用户文档发布在站点根路径，把 playground 发布在 `/playground/` 子路径。playground 预览 iframe 的 href 必须（MUST）是相对路径。站点 `base` 必须（MUST）可通过环境变量配置，默认适用于 project site `/json-schema-form/`。`site:build` 必须（MUST）先生成 TypeDoc API，再构建 VitePress，再拼接 playground，产出包含文档 `index.html`、`api/` 与 `playground/element-plus.html` 的单一静态目录，并包含 `.nojekyll`。网站构建不得（MUST NOT）成为 `verify:v1` 的前置步骤。

#### Scenario: 拼接产物包含文档根、API 与 playground 子路径
- **GIVEN** 已构建产品 package 的工作区，并设置 `DOCS_BASE=/json-schema-form/` 与对应 playground base
- **WHEN** 运行 `site:build`
- **THEN** 输出目录含文档首页、API 页面、`.nojekyll`，以及 `playground/index.html` 与 adapter 预览 HTML

#### Scenario: Pages 工作流独立于 v1 门禁
- **GIVEN** 仓库 CI 工作流
- **WHEN** 检查 GitHub Pages 部署与 `verify:v1`
- **THEN** Pages 部署由独立 workflow 在 `master` 上构建 `site:build` 并上传 Pages artifact，`verify:v1` 命令图不包含文档站、TypeDoc 或 playground production 构建

### Requirement: 定制文档按层级说明可替换面
用户文档必须（MUST）按由浅到深的定制层级说明：仅 Schema、`uiSchema.fields`、layout、Rules/Config、Core Plugin（无 UI）、Adapter 追加 widget、Environment override、整份 Adapter / fieldChrome。文档必须（MUST）写明 custom widget 不得接收 `FormInstance`，以及本库没有 rjsf 式 `fields` / `templates` / `Theme` 对象。

#### Scenario: 定制阶梯区分逻辑 Widget 与 UI binding
- **GIVEN** 定制频道页面
- **WHEN** 读者查看 Plugin 与 Adapter 两层
- **THEN** 文档说明 `defineWidget()` 只声明逻辑契约，Vue/React 组件必须通过 Adapter `WidgetBinding` 或 `extend*Adapter` 安装

### Requirement: TypeDoc 只扫描公开 exports
API 频道必须（MUST）由 TypeDoc 从各产品 package 的 `package.json` `exports` 入口生成，不得（MUST NOT）展开扫描内部 domain 目录。未写入 `exports` 的 deep import 必须（MUST）在 API 说明中标为非公共 API。生成物写入用户站点 `api/` 路径，且不得（MUST NOT）作为贡献者基线提交进 `docs/architecture.md`。

#### Scenario: API 站按 package 入口分组
- **GIVEN** 已构建 declaration 的工作区
- **WHEN** 运行 TypeDoc 生成命令
- **THEN** 输出覆盖 `@xunserver-jsf/core`、`core/runtime`、`core/extension`、`validator-ajv`、`vue`、`react` 与五个 Adapter 根入口，且不把未导出内部模块列为文档入口
