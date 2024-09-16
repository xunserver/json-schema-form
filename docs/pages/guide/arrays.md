# 数组

数组 index 只是当前地址，`ArrayItemId` 才是身份。增删改走 `form.array(path)`，不要靠改 index 猜 item。

对照：[computed-array.json](https://github.com/xunserver/json-schema-form/blob/master/examples/shared/catalog/computed-array.json)、[kitchen-sink.json](https://github.com/xunserver/json-schema-form/blob/master/examples/shared/catalog/kitchen-sink.json)。

## 结构命令

```ts
const products = form.array("products");
const id = products.append({ title: "New", quantity: 1, price: 10 });
products.insert(0, { title: "Head" });
products.move(id, 0);
products.setItemValue(id, { title: "Updated", quantity: 2, price: 10 });
products.remove(id);
products.clear();
```

- `move` 之后 Field / View 状态跟随 `ArrayItemId`
- `remove` / `replaceItem` / `reset` 以及默认的整段数组 `setValue` 会作废旧 ID
- `setItemValue` 保留根 item ID
- 固定 tuple 不能 append / insert / remove / move / clear

可在 `createForm` 选项里按数组 `ModelPath` 提供纯同步 `ArrayIdentityResolver`（类型从 `@xunserver-jsf/core/runtime` 导入）。重复 key 或抛错会回滚事务。

## 在 UI 里追加

数组的「添加一行」由 Adapter 的 `array` layout binding 调用上述 command。自定义 layout 时，从 `LayoutRenderInput` 的 semantic actions 触发，不要自己改 values 数组。

## RenderScope

`getRenderScope(form)` 把模板路径 `products[].name` 解析成当前 `InstancePath`。item 被 remove 后 scope 永久 stale。SSR 与客户端要复用同一身份，必须恢复 Core 的同一 identity snapshot。
