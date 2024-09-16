# 条件与计算

规则写在 `FormDefinition.rules`，是 JSON AST，不是任意 JS。四类：`state`、`computed`、`validation`、`effect`。named function 必须用 `defineRuleFunction()` 注册进 Core Environment，模型里只存 key。

对照：[conditional.json](https://github.com/xunserver/json-schema-form/blob/master/examples/shared/catalog/conditional.json)、[computed-array.json](https://github.com/xunserver/json-schema-form/blob/master/examples/shared/catalog/computed-array.json)。

## 条件显示

`visible` 是 UI 状态；Schema `if`/`then` 影响的是 **active / required**，两者不要混用。hidden 字段仍可以保持 active（提交时默认仍会序列化，除非 inactive）。

```ts
rules: [
  {
    kind: "state",
    target: "nickname",
    action: { visible: { eq: [{ field: "kind" }, "show"] } },
  },
]
```

## 计算字段

computed target 在 Runtime 里强制 `readonly`。下面的 `playground.mul` 必须先注册（playground 的 `createDemoEnvironment` 已注册）。

```ts
rules: [
  {
    kind: "computed",
    target: "products[].lineTotal",
    action: {
      value: { call: "playground.mul", args: [{ field: "products[].quantity" }, { field: "products[].price" }] },
    },
  },
]
```

表达式可用 scalar、`{ const }`、`{ field }`、`{ call, args }` 与固定 operator（如 `eq`）。数组规则按同一 item 的相对 `ModelPath` 绑定。

下一步：把 named function 放进 Plugin，见 [Core Plugin](/customize/plugin)。
