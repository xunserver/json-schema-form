# 数组身份

数组 index 只是当前地址，`ArrayItemId` 才是 item 身份。`FormInstance.array(path)` 与 `scope(path)` 返回共享同一 Runtime 的轻量 facade。

## 结构命令

- `move` 之后，Field / View source state 跟随 `ArrayItemId`
- `remove` / `replaceItem` / `reset` 以及默认 whole-array `setValue` 会作废旧 ID 与 scope
- `setItemValue` 保留根 item ID
- 未配置 Identity Resolver 时，有效的整个数组替换会重建全部 item ID，不会按 index 或业务字段猜测复用

可在 `createForm` 选项中按数组 `ModelPath` 提供纯同步 `ArrayIdentityResolver`（类型从 `@form/core/runtime` 导入）做 key reconcile。重复 key 或抛错会使 transaction 回滚。

固定 tuple 现存 slot 可 `setItemValue` / `replaceItem`，但不支持 append / insert / remove / move / clear。

## RenderScope

`getRenderScope(form | scoped)` 可把模板 `ModelPath`（如 `products[].name`）解析为当前 `InstancePath`。move 后同一 scope 的 chain 不变而 path 更新；remove / replace / clear / reset 后永久 stale。

若 SSR 与客户端要复用同一 item 身份，必须恢复 Core 提供的同一 identity snapshot。Vue / React key 使用 `ViewNodeId` 与 `ArrayItemId`。
