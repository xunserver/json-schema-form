# 如何阅读 API

本站 `/api/` 由 TypeDoc 从各产品 package 的 **`package.json` `exports`** 生成，构建时写入 `docs/pages/api/`（不入库）。

覆盖：

- `@xunserver-jsf/core`、`@xunserver-jsf/core/runtime`、`@xunserver-jsf/core/extension`
- `@xunserver-jsf/validator-ajv`
- `@xunserver-jsf/vue`、`@xunserver-jsf/react`
- `@xunserver-jsf/element-plus`、`antd`、`arco-vue`、`arco-react`、`shadcn`

未写入 `exports` 的 deep import 不是公共 API，即使 TypeDoc 因再导出偶尔提到内部类型名。先看 [定制层级](/customize/) 和 [快速开始](/guide/getting-started)，再查符号。

本地生成：

```bash
pnpm docs:api
pnpm docs:dev
```
