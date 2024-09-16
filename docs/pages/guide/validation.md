# 校验与错误

校验的 owner 是 Core Runtime，不是 UI 库的 Form。AJV 必须作为 Plugin validator 放进 `FormEnvironment`，key 为 `ajv-2020`（`AJV_VALIDATOR_KEY`）。

对照：[validation.json](https://github.com/xunserver/json-schema-form/blob/master/examples/shared/catalog/validation.json)。

## 配置

```ts
config: {
  schemaValidator: "ajv-2020",
  validateOn: "change", // 默认 "submit"；也可 "blur"
  errorPresentation: "touched-or-submitted",
}
```

`validateOn` 决定何时跑校验；`errorPresentation` 决定何时把错误交给 FieldChrome。两者独立，互不改写。

## Schema + Rule 校验

```ts
const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      email: { type: "string", minLength: 5 },
      password: { type: "string", minLength: 8 },
      confirm: { type: "string" },
    },
    required: ["email", "password", "confirm"],
  },
  uiSchema: {
    fields: {
      email: { display: { label: "邮箱", help: "至少 5 个字符" } },
      password: { display: { label: "密码" } },
      confirm: { display: { label: "确认密码" } },
    },
  },
  rules: [
    {
      kind: "validation",
      target: "confirm",
      action: {
        assertion: { eq: [{ field: "confirm" }, { field: "password" }] },
        failure: { code: "password.mismatch", message: "两次密码必须一致" },
      },
    },
  ],
  config: {
    schemaValidator: "ajv-2020",
    validateOn: "change",
    errorPresentation: "touched-or-submitted",
  },
});
```

## 运行时方法

| 方法 | 作用 |
|---|---|
| `form.validate()` | 跑当前计划，返回 `ValidationResult`（含 `superseded`） |
| `form.applyErrors(errors)` | 合并服务端错误 |
| `form.submit(handler)` | 校验通过后把 `serialize()` 交给 handler |

Renderer 只读 `presentableErrors`。Vue：`usePresentableErrors`；React：同名 hook。不要去读 Element Plus / Ant Design 自己的 `validate()`。

异步 validator 遵循 latest-wins：过期结果带 `superseded: true`，不得写回当前 snapshot。
