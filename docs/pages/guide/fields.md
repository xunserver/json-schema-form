# 字段与外观

只写 Schema 时，编译器会按类型匹配内置逻辑 widget，并生成默认 ViewTree。要改标签、控件种类或某个 Adapter 的外观，写 `uiSchema.fields`。字段 key 是静态 `ModelPath`（`products[].name`），不是 `products[0]`。

对照例子：Playground catalog [`simple.json`](https://github.com/xunserver/json-schema-form/blob/master/examples/shared/catalog/simple.json)、[`all-fields.json`](https://github.com/xunserver/json-schema-form/blob/master/examples/shared/catalog/all-fields.json)、[`kitchen-sink.json`](https://github.com/xunserver/json-schema-form/blob/master/examples/shared/catalog/kitchen-sink.json)。

## 换 label 与 widget

```ts
const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      bio: { type: "string" },
      active: { type: "boolean" },
    },
  },
  uiSchema: {
    fields: {
      name: { widget: "text", display: { label: "姓名", help: "全名" } },
      bio: { widget: "textarea", display: { label: "简介" } },
      active: { widget: "switch", display: { label: "启用" } },
    },
  },
});
```

内置逻辑 widget：`text` `textarea` `number` `select` `multi-select` `checkbox` `switch` `date` `datetime`。boolean 默认 `checkbox`；要 `switch` 必须显式指定。`format: date` / `date-time` 会匹配日期控件。

`select` / `multi-select` 的选项放在 `props.options`。

## Adapter 外观：`native`

`native[adapterId]` 只传该 Adapter 认识的外观选项。其它 Adapter 的 namespace 会被忽略。

```ts
uiSchema: {
  fields: {
    name: {
      widget: "text",
      display: { label: "姓名" },
      native: {
        "element-plus": { placeholder: "Ada Lovelace", clearable: true },
      },
    },
  },
}
```

下列键由 Core / Renderer 控制，写进 `props` 或 `native` 会诊断并拒绝该 binding：`value` / `modelValue` / `disabled` / `readonly` / `required` / `errors` / ARIA / change-focus-blur handlers / 宿主 Form 的 `rules` `validate` `model`。完整集合见各 Adapter 导出的 `PROTECTED_NATIVE_KEYS`。

## 行为

`behavior.visible` / `disabled` / `readonly` 是静态 UI 意图。运行时还会和 Rule、Schema activation 组合成 [effective state](/concepts/state)。`required` 不是 `FieldUI` 成员。

## 默认 widget 不够时

换一个逻辑 widget 名（L1）通常就够。要新控件：先在 Core Plugin 里 `defineWidget`（L4），再在 Adapter 里提供同名 `WidgetBinding`（L5）。见 [定制层级](/customize/)。
