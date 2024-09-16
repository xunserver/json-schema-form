# Playground

Playground 用来对照同一份 Form Definition 在多套 Adapter 上的渲染。它是非发布 example，不是产品 package。

- 在线：[Playground](/playground/)
- 文档：[文档首页](/)
- 仓库：https://github.com/xunserver/json-schema-form

## 本地

```bash
pnpm playground
```

打开 http://127.0.0.1:5173/ 。左侧编辑 `schema` / `uiSchema` / `rules` / `config` / `formData`；右侧 iframe 对照 Element Plus / Ant Design / Arco Vue / Arco React / shadcn。

共享 catalog 在 `examples/shared/catalog/`：

| id | 演示 |
|---|---|
| `simple` | 默认 ViewTree + label |
| `all-fields` | 九类 widget |
| `kitchen-sink` | layout、数组、可见性、自定义货币 |
| `validation` | required / minLength / change + 错误展示 |
| `conditional` | if/then + 可见性 |
| `computed-array` | 数组 + 计算字段 |

工作台 chrome 的 shadcn 组件不是表单 Widget 源；产品 `@xunserver-jsf/shadcn` 由独立预览帧挂载。

## GitHub Pages

线上地址与当前文档站点同源，路径为 `/playground/`。从文档站点击该链接会整页进入演练场，而不是走 VitePress 客户端路由。

`pnpm docs:dev` 只预览文档。完整静态站点：`pnpm site:build`，产物在 `docs/.vitepress/dist`。
