# Plugin 与扩展

扩展通过冻结 Registry 注册能力，不得绕过 TransactionManager，也不得修改 Compiled Model。类型只从 `@xunserver-jsf/core/extension` 导出。

```ts
import { compileForm, CompileError, defineForm } from "@xunserver-jsf/core";
import {
  createFormEnvironment,
  definePlugin,
  defineRuleFunction,
  defineWidget,
  EnvironmentBuildError,
} from "@xunserver-jsf/core/extension";

const definition = defineForm({
  schema: {
    type: "object",
    properties: { sku: { type: "string" } },
  },
});

const companyPlugin = definePlugin({
  id: "company",
  dependsOn: ["core"],
  contributes: {
    widgets: {
      sku: defineWidget({
        name: "sku",
        valueContract: {
          jsonTypes: ["string"],
          canonical: "json-scalar",
        },
        interaction: { setValue: true, touch: true, focus: true, blur: true },
      }),
    },
    ruleFunctions: {
      "company.tax": defineRuleFunction({
        name: "company.tax",
        evaluate: (args) => args[0] ?? 0,
      }),
    },
  },
});

try {
  const environment = createFormEnvironment({ plugins: [companyPlugin] });
  const compiled = compileForm(definition, { environment });
  void compiled.model;
} catch (error) {
  if (error instanceof EnvironmentBuildError || error instanceof CompileError) {
    void error.diagnostics;
  }
}
```

## 可注册的能力

| 定义 | 形状 | 约束 |
|---|---|---|
| `defineWidget()` | identity + `valueContract` + `interaction` | 不安装 Registry；不要把 Vue/React 组件写进 Core Widget |
| `defineRuleFunction()` | named function | Compiled Model 只保存 key |
| `defineValidator()` | sync / async validate | 必须进入冻结 Environment |
| `SchemaDialectDefinition` | `{ name, dialects, convert() }` | 纯同步，只读输入 |
| `SchemaExtensionDefinition` | `{ name, keyword: x-*, split() }` | keyword 必须是 `x-*` |
| `ValueInitializerDefinition` | `{ name, initialize() }` | 在 identity materialization 之前同步执行一次 |

Environment build 校验 key 与 `name` 一致，并保证 `$schema` URI 与 `x-*` keyword 在整个 Environment 内唯一。冲突、空 URI 集合或非 `x-` 前缀以 `source: "plugin"` 阻断，不发布 partial Registry。

Core 不内置 draft-07/draft-04 adapter，也不内置任何 `x-*` 词汇。

## Widget interaction

`WidgetDefinition.interaction` 以纯数据声明 `setValue` / `touch` / `focus` / `blur`。Renderer 通过 Core 公开 command 实现这些动作。自定义逻辑 Widget 只能拿到 readonly descriptor、snapshots、scope view 与这些 command，不要传入 `FormInstance`、Store writer 或 native event。

## valueInitializer

`FormConfig.valueInitializer` 只声明已注册的 string key。Compiler 校验 key 存在后写入 Compiled Model，不执行 provider。`createForm()` 的 `valueInitializer` option 可覆盖本次实例的默认 key（option > Compiled default > none）。命中后 Runtime 同步运行一次 `initialize()`，结果成为 version 0 的 dirty 基线。
