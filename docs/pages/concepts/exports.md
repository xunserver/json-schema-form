# Core 三入口

`@xunserver-jsf/core` 只通过 `exports` 暴露三个入口。未声明 deep import 会被拒绝。

| 入口 | 用途 |
|---|---|
| `@xunserver-jsf/core` | Application：`defineForm` / `compileForm` / `createForm` / `FormInstance` |
| `@xunserver-jsf/core/runtime` | 只读 selector、subscription、`RenderScope`、`getRenderScope()` |
| `@xunserver-jsf/core/extension` | `definePlugin` / `defineWidget` / `createFormEnvironment` |

根入口不重导出 `RenderScope`、`defineWidget` 或内部 Store / Scheduler / `RuntimeNodeId`。

完整符号表见 [TypeDoc API](/api/)；阅读说明见 [如何阅读 API](/api-overview)。
