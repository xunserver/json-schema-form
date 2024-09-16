# Path 与身份

Path 表示「在哪里」，ID 表示「是谁」。

| 种类 | 例子 | 用在 |
|---|---|---|
| `ModelPath` | `products[].name`、tuple `[#n]` | Definition、编译后的字段表 |
| `InstancePath` | `products[0].name` | Runtime 读写 values |
| `SchemaPath` | JSON Schema 指针 | dialect / `x-*` / 校验定位 |

`products[0]` 不会出现在 Compiled DataModel。数组 index 不是身份；item 身份是 `ArrayItemId`。View 节点身份是 `ViewNodeId`。

`getRenderScope(form)`（`@xunserver-jsf/core/runtime`）把模板 ModelPath 解析为当前 InstancePath。不要把 `RenderScope` 当成 `FormInstance` 传给 Renderer。
