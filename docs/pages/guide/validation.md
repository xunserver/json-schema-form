# Validation

Core 只通过 Registry key 引用 validator，不嵌入 AJV instance、callback 或 Runtime binding。AJV 只允许出现在 `@xunserver-jsf/validator-ajv`。

`defineValidator()` 是 Extension identity helper，必须注册进冻结 `FormEnvironment` 后才能被 `compileForm()` 解析。

```ts
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import {
  createFormEnvironment,
  definePlugin,
  defineValidator,
} from "@xunserver-jsf/core/extension";
import { AJV_VALIDATOR_KEY, createAjvValidator } from "@xunserver-jsf/validator-ajv";

const environment = createFormEnvironment({
  plugins: [
    definePlugin({
      id: "company",
      dependsOn: ["core"],
      contributes: {
        validators: {
          [AJV_VALIDATOR_KEY]: createAjvValidator(),
          "company.unique-email": defineValidator({
            name: "company.unique-email",
            kind: "async",
            validate: async () => [],
          }),
        },
      },
    }),
  ],
});

const { model } = compileForm(
  defineForm({
    schema: {
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    },
    config: {
      schemaValidator: AJV_VALIDATOR_KEY,
      validateOn: "submit",
      errorPresentation: "touched-or-submitted",
      validators: [{ validator: "company.unique-email", target: "email", dependencies: [] }],
    },
  }),
  { environment },
);

const form = createForm(model, { environment, initialValues: { email: "a@b.c" } });
form.applyErrors([{ code: "remote", instancePath: "email" }]);
await form.validate();
await form.submit(async (payload) => {
  void payload;
});
```

## 配置

| 配置 | 含义 |
|---|---|
| `schemaValidator` | 已注册 validator 的 Registry key |
| `validateOn` | automatic 执行时机，默认 `submit` |
| `errorPresentation` | 是否展示错误，默认 `touched-or-submitted` |
| `validators` | 额外 custom validator 绑定 |

`validateOn` 与 `errorPresentation` 互不改写。

## 公开方法

- `validate()`：执行完整 effective validation，并等待本次 async latest-wins
- `applyErrors()`：原子注入 server errors
- `submit(handler)`：先完整校验；invalid 时不调用 handler；valid 时用同一 snapshot 的 `serialize()` 结果调用业务 handler

Core 不发起网络请求。Renderer 只读 snapshot，不得写入 errors。UI 库自己的 Form Store / `validate` / `resetFields` 不是业务状态。
