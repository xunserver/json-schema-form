# Core Plugin（L4）

Core Plugin 注册**逻辑**能力：Widget 身份、validator、rule function、dialect、`x-*`、serializer、valueInitializer。不要把 Vue/React 组件写进 `defineWidget()`。

`createFormEnvironment({ plugins })` 得到冻结 Environment。**同一个对象 identity** 必须同时传给 `compileForm` 与 `createForm`。不要靠 Plugin 列表长得像来匹配。长期复用可用 `createFormEngine({ plugins })`，它闭包持有同一 Environment。

```ts
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import {
  createFormEnvironment,
  definePlugin,
  defineRuleFunction,
  defineWidget,
} from "@xunserver-jsf/core/extension";
import { AJV_VALIDATOR_KEY, createAjvValidator } from "@xunserver-jsf/validator-ajv";

const currencyWidget = defineWidget({
  name: "company.currency",
  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
  interaction: { setValue: true, touch: true, focus: true, blur: true },
});

const environment = createFormEnvironment({
  plugins: [
    definePlugin({
      id: "company",
      dependsOn: ["core"],
      contributes: {
        widgets: { "company.currency": currencyWidget },
        validators: { [AJV_VALIDATOR_KEY]: createAjvValidator() },
        ruleFunctions: {
          "company.tax": defineRuleFunction({
            name: "company.tax",
            evaluate: (args) => args[0] ?? 0,
          }),
        },
      },
    }),
  ],
});

const definition = defineForm({
  schema: {
    type: "object",
    properties: { amount: { type: "string" } },
  },
  uiSchema: {
    fields: { amount: { widget: "company.currency", display: { label: "金额" } } },
  },
  config: { schemaValidator: AJV_VALIDATOR_KEY },
});

const { model } = compileForm(definition, { environment });
const form = createForm(model, { environment });
```

这一步之后表单还不会画出货币控件：还要在 Adapter 安装同名 `WidgetBinding`，见 [追加与覆盖](./override.md)。

Playground 逻辑层实现：`examples/shared/src/environment.ts`。

## 可注册的能力

| 定义 | 约束 |
|---|---|
| `defineWidget()` | identity + `valueContract` + `interaction`；不安装 UI |
| `defineRuleFunction()` | Compiled Model 只保存 key |
| `defineValidator()` | 必须进入冻结 Environment |
| `SchemaDialectDefinition` | 纯同步 `convert()` |
| `SchemaExtensionDefinition` | keyword 必须是 `x-*` |
| `ValueInitializerDefinition` | identity materialization 之前同步执行一次 |

冲突、空 URI 或非 `x-` 前缀以 `source: "plugin"` 阻断，不发布 partial Registry。Core 不内置 draft-07 adapter，也不内置 `x-*` 词汇。
