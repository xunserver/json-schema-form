# Vue Renderer 与 Element Plus Adapter

本文说明 `@form/vue` 与 `@form/element-plus` 的公开用法。Core `FormEnvironment` 仍是 Widget 定义、规则和校验的真相；Element Plus Form 的 `rules` / `validate` / `resetFields` 不得作为业务状态。

## 简单路径

```ts
import { defineForm, compileForm, createForm } from "@form/core";
import { FormRenderer } from "@form/vue";
import { elementPlusAdapter } from "@form/element-plus";

const { model } = compileForm(defineForm({ schema }));
const form = createForm(model, { initialValues });
```

```vue
<FormRenderer :form="form" :adapter="elementPlusAdapter" />
```

## 高级路径：RendererEnvironment

`defineVueUIAdapter()` 只规范化描述，不安装全局 Registry。`createVueRendererEnvironment()` 先校验 adapter ID、protocol、四类 role、registry key 与 override，再冻结发布。

```ts
import { createVueRendererEnvironment } from "@form/vue";
import { createElementPlusAdapter, extendElementPlusAdapter } from "@form/element-plus";

const environment = createVueRendererEnvironment({
  adapters: [createElementPlusAdapter()],
  contributions: [extendElementPlusAdapter({ owner: "app", widgets: { "company.currency": binding } })],
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

Custom Widget 只能拿到 readonly descriptor、snapshots、scope view 与 `setValue` / `touch` / `focus` / `blur`。不要传入 `FormInstance`、Store writer 或 native event。

## SSR 与 identity

服务端只读一次 committed snapshot，不访问 `window` / `document`，不安装 Runtime subscription。客户端 `onMounted` 后重读并订阅。Vue key 使用 `ViewNodeId` 与 `ArrayItemId`。若 server/client 要复用同一 item 身份，必须恢复 Core 提供的同一 identity snapshot。

可注入 `idPrefix`；默认使用 Vue SSR-safe `useId()`。

## 受保护的 Element Plus native keys

`native["element-plus"]` 可提供非保留外观选项。下列键由 Core/Renderer 控制，出现在 props 或 native 中会诊断并阻止该 binding：

- `value` / `modelValue` / `defaultValue`
- `disabled` / `readonly` / `required`
- `errors` / `status` / `validateStatus`
- IDs 与 `aria-*`
- `onUpdate:modelValue` 以及 change / focus / blur handlers
- `rules` / `validate` / `resetFields` / `model`

其他 adapter namespace（例如 `mui`）会被忽略。

## 与 Core 的边界

- Renderer 只遍历 `CompiledFormModel.ui.viewTree`。
- `RenderScope` / `InstanceBinding` / `getRenderScope()` 从 `@form/core/runtime` 导入。
- Group 折叠与 Tab 只读写 Core `collapsed` / `activeTab`。
- 不要把 Vue component 写进 `defineWidget()` 或 Core `FormEnvironment`。
