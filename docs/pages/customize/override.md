# 追加与覆盖 Widget（L5 / L6）

逻辑 widget 在 Core，真正的 `render()` 在 Adapter。

## L5：追加，不覆盖

`createElementPlusAdapter({ widgets })`（以及 Antd / Arco / shadcn 的对应工厂）用 `mergeExclusive`：**已有内置 key 不会被覆盖**，只能加新 key。

```ts
import { createElementPlusAdapter } from "@xunserver-jsf/element-plus";

const adapter = createElementPlusAdapter({
  widgets: {
    "company.currency": currencyBinding, // WidgetBinding：codec + render
  },
});
```

`FormRenderer` 可以直接 `:adapter="adapter"`。这够用在「新增业务控件」。

## L6：替换内置

要换掉 `text` 等内置 key，必须 `extend*Adapter` + `create*RendererEnvironment` 的精确 override。冲突键是 `(adapterId, registryKind, key)`。wildcard 与未消费 override 会阻断构建。

```ts
import { createVueRendererEnvironment } from "@xunserver-jsf/vue";
import { createElementPlusAdapter, extendElementPlusAdapter } from "@xunserver-jsf/element-plus";

const environment = createVueRendererEnvironment({
  adapters: [createElementPlusAdapter()],
  contributions: [
    extendElementPlusAdapter({
      owner: "app",
      widgets: { text: appTextBinding, "company.currency": currencyBinding },
    }),
  ],
  overrides: [
    {
      adapterId: "element-plus",
      registry: "widgets",
      key: "text",
      expectedOwner: "element-plus",
      replacementOwner: "app",
    },
  ],
});
```

```vue
<FormRenderer :form="form" :environment="environment" adapter-id="element-plus" />
```

`FormRenderer` 的 `adapter` 与 `environment`+`adapterId` 二选一，不能同时传。

Custom binding 只能拿到 readonly descriptor、snapshots、scope view 与 `setValue` / `touch` / `focus` / `blur`。对照实现：`examples/playground/src/previews/*/renderer.ts`。
