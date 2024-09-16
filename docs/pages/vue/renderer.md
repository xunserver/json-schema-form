# Vue Renderer

`@xunserver-jsf/vue` 只依赖 Core 与 Vue peer。它遍历已解析的 `CompiledFormModel.ui.viewTree`，读取 readonly snapshot，通过 Core command 写回。不要让 Vue 解释 Schema、Rule 或 Validation 来源。

公开入口导出 `FormRenderer` / `ViewRenderer` / `FieldRenderer`、readonly composables，以及 `defineVueUIAdapter()` / `createVueRendererEnvironment()`。

```ts
import { defineForm, compileForm, createForm } from "@xunserver-jsf/core";
import { FormRenderer } from "@xunserver-jsf/vue";
import { elementPlusAdapter } from "@xunserver-jsf/element-plus";

const { model } = compileForm(defineForm({ schema }));
const form = createForm(model, { initialValues });
```

```vue
<FormRenderer :form="form" :adapter="elementPlusAdapter" />
```

## RendererEnvironment

`defineVueUIAdapter()` 只规范化描述，不安装全局 Registry。`createVueRendererEnvironment()` 先校验 adapter ID、protocol、四类 role、registry key 与 override，再冻结发布。

```ts
import { createVueRendererEnvironment } from "@xunserver-jsf/vue";
import { createElementPlusAdapter, extendElementPlusAdapter } from "@xunserver-jsf/element-plus";

const environment = createVueRendererEnvironment({
  adapters: [createElementPlusAdapter()],
  contributions: [
    extendElementPlusAdapter({
      owner: "app",
      widgets: { "company.currency": binding },
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

冲突键是 `(adapterId, registryKind, key)`。重复默认失败；替换必须给出精确 expected/replacement owner。wildcard 与未消费 override 都会阻断构建。

## Custom render

Custom Widget 只能拿到 readonly descriptor、snapshots、scope view 与 `setValue` / `touch` / `focus` / `blur`。不要传入 `FormInstance`、Store writer 或 native event。不要把 Vue component 写进 `defineWidget()` 或 Core `FormEnvironment`。

`RenderScope` / `InstanceBinding` / `getRenderScope()` 从 `@xunserver-jsf/core/runtime` 导入。Group 折叠与 Tab 只读写 Core `collapsed` / `activeTab`。

## SSR 与 identity

服务端只读一次 committed snapshot，不访问 `window` / `document`，不安装 Runtime subscription。客户端 `onMounted` 后重读并订阅。Vue key 使用 `ViewNodeId` 与 `ArrayItemId`。若 server/client 要复用同一 item 身份，必须恢复 Core 提供的同一 identity snapshot。

可注入 `idPrefix`；默认使用 Vue SSR-safe `useId()`。

## 只读 composables

`useFormSnapshot`、`useFieldSnapshot`、`useViewSnapshot`、`usePresentableErrors`、`useArraySnapshot` 等从 `@xunserver-jsf/vue` 根入口导出，内部仍通过 Core runtime selector 订阅。
