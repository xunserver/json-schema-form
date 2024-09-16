# 布局

未写 `uiSchema.layout` 时，编译器按 Schema 生成默认 ViewTree。要分组、分栏或控制数组区域，写作者 layout 树。

对照：[kitchen-sink.json](https://github.com/xunserver/json-schema-form/blob/master/examples/shared/catalog/kitchen-sink.json)。

## 节点种类

| `type` | 作用 |
|---|---|
| `field` | 挂一个 `path`（ModelPath） |
| `object` | 对象容器 |
| `array` | 数组容器，需要 `path` |
| `group` | 可折叠分组 |
| `layout` | 栅格；可用 `columns` |
| `remaining-fields` | 插入尚未出现在 layout 里的字段 |

```ts
uiSchema: {
  fields: {
    name: { display: { label: "姓名" } },
    bio: { display: { label: "简介" } },
    age: { display: { label: "年龄" } },
    role: { widget: "select", display: { label: "角色" }, props: { options: ["admin", "user"] } },
    "products[].title": { display: { label: "标题" } },
    "tags[]": { field: false },
  },
  layout: {
    type: "object",
    children: [
      {
        type: "group",
        children: [
          { type: "field", path: "name" },
          { type: "field", path: "bio" },
        ],
      },
      {
        type: "layout",
        columns: 2,
        children: [
          { type: "field", path: "age" },
          { type: "field", path: "role" },
        ],
      },
      { type: "array", path: "products", children: [{ type: "remaining-fields" }] },
      { type: "remaining-fields" },
    ],
  },
}
```

`field: false` 把该路径从默认 ViewTree 排除（kitchen-sink 用它隐藏 `tags[]` 子字段，只保留 multi-select）。

Field Registry（`model.ui.fields`）与 ViewTree（`model.ui.viewTree`）是分开的：前者回答「有哪些字段」，后者回答「怎么排」。
