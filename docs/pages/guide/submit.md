# 提交与序列化

`FormRenderer` 把宿主 `<form>` submit 接到 `form.submit(handler)`。你也可以不经过 Renderer，直接调 Runtime。

```ts
const result = await form.submit(async (payload) => {
  await fetch("/api/forms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
});

if (!result.valid) {
  // result.errors；FieldChrome 会按 errorPresentation 展示
}
```

`submit` 先校验；失败时不调用 handler，`submitted` 为 false。成功时 `payload` 是 `serialize()` 的结果。

## serialize 规则

```ts
form.serialize();
form.serialize({ includeInactive: true });
form.serialize({ serializer: "my-serializer" });
```

默认只序列化 **active** 字段（与 `visible` 无关）。Compiled `serializeInactive` 缺省为 false。显式 `includeInactive` 或 named Serializer 可覆盖。`disabled` / `readonly` 不参与 prune。

`setValues(values)` 是整根替换，不是 deep-merge。`reset()` 恢复 dirty 基线，并重建 array identity、View 的 focused / collapsed / activeTab。

服务端错误用 `form.applyErrors([{ code, instancePath, message }])` 写回。
