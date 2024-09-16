# Playground

Playground 是单个 Vite 多页面工作台，用来对照同一份 Form Definition 在多套 Adapter 上的渲染结果。它是非发布 example，不是产品 package。

## 本地

```bash
pnpm playground
```

打开 http://127.0.0.1:5173/ ：

- `index.html`：左侧 Monaco JSON 编辑器与 Inspector（React + shadcn 工作台 chrome）
- `element-plus.html` / `antd.html` / `arco-vue.html` / `arco-react.html` / `shadcn.html`：右侧 Adapter 预览

左侧可编辑 `schema` / `uiSchema` / `rules` / `config` / `formData`。各预览页各自独立 `createForm`。切换 Adapter Tab 只改变可见帧与 Inspector 焦点；已打开过的预览帧保持挂载。

共享例子与编译管线在 `examples/shared`。playground 编辑器 chrome 的 shadcn 组件不是表单 Widget 源；产品 `@xunserver-jsf/shadcn` adapter 由独立预览帧挂载。

## GitHub Pages

文档站发布后，Playground 位于同一站点的 `/playground/`，例如：

```text
https://xunserver.github.io/json-schema-form/playground/
```

本地 `pnpm docs:dev` 只预览文档，不托管 playground。完整静态站点使用：

```bash
pnpm site:build
```

产物在 `docs/.vitepress/dist`：文档在根路径，playground 在 `playground/` 子目录。
