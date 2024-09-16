# Form Definition

`defineForm()` 只做 authoring：组装 JSON Schema、UI Schema、Rule 与 FormConfig。它不编译、不创建 Runtime、也不注册全局状态。

```ts
import { defineForm } from "@form/core";

const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      products: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" } },
        },
      },
    },
  },
  uiSchema: {
    fields: {
      "products[].name": { display: { label: "Name" } },
    },
  },
});
```

## 四份契约

| 字段 | 职责 |
|---|---|
| `schema` | 数据契约。Canonical dialect 是 JSON Schema Draft 2020-12。 |
| `uiSchema` | 呈现契约。描述逻辑 Widget、label、layout，不拥有 values。 |
| `rules` | JSON 兼容的 `RuleExpression` AST，分为 State、Computed、Validation、Effect。 |
| `config` | 表单级 Runtime 配置，例如 `schemaValidator`、`validateOn`、`serializer`、`valueInitializer`。 |

## Path

静态 `ModelPath` 使用 `products[].name`、转义 property 的 JSON-string bracket，以及 tuple 的 `[#n]`。`products[0]` 属于 Runtime `InstancePath`，不会出现在 Compiled DataModel。

Path 表示「在哪里」，ID 表示「是谁」。数组 index 不是身份，详见 [数组身份](./arrays.md)。

## Field 与 View

Field Registry 与 ViewTree 分离：

- 检查 Field 用编译后的 `model.ui.fields`
- 检查呈现结构用已解析的 `model.ui.viewTree`

来自 Object property edge 的 Field 带有只读 `requirement` presentation source（`required` / `optional` / `conditional`）。`required` 不是 `FieldUI` 成员；实例级 effective `required` 由 Runtime 在 activation 之后组合进 snapshot。

## Rules

`FormDefinition.rules` 使用 JSON-compatible AST：scalar / `{ const }` / `{ field }` / `{ call, args }` / 固定 operator。named function 只通过 `@form/core/extension` 的 `defineRuleFunction()` 注册到 Environment，Compiled Model 只保存 function key。

数组 Rule 按同一 item 的相对 `ModelPath` 绑定，不接受无法唯一确定的 sibling/descendant collection。`oneOf` / `anyOf` / `if` / `dependentSchemas` 编译为有限 activation plan；无法保真的 predicate 在编译期阻断。
