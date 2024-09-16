# React Renderer

`@xunserver-jsf/react` 只依赖 Core 与 React peer。它遍历已解析的 ViewTree，读取 readonly snapshot，通过 Core command 写回。不要让 React 解释 Schema、Rule 或 Validation 来源。

公开入口导出 `FormRenderer` / `ViewRenderer` / `FieldRenderer`、readonly hooks，以及 `defineReactUIAdapter()` / `createReactRendererEnvironment()`。

```tsx
import { defineForm, compileForm, createForm } from "@xunserver-jsf/core";
import { FormRenderer } from "@xunserver-jsf/react";
import { antdAdapter } from "@xunserver-jsf/antd";

const { model } = compileForm(defineForm({ schema }));
const form = createForm(model, { initialValues });

export function App() {
  return <FormRenderer form={form} adapter={antdAdapter} />;
}
```

## RendererEnvironment

`defineReactUIAdapter()` 只规范化描述，不安装全局 Registry。`createReactRendererEnvironment()` 先校验 adapter ID、protocol、四类 role、registry key 与 override，再冻结发布。

```tsx
import { createReactRendererEnvironment } from "@xunserver-jsf/react";
import { createAntdAdapter, extendAntdAdapter } from "@xunserver-jsf/antd";

const environment = createReactRendererEnvironment({
  adapters: [createAntdAdapter()],
  contributions: [
    extendAntdAdapter({
      owner: "app",
      widgets: { "company.currency": binding },
    }),
  ],
  overrides: [
    {
      adapterId: "antd",
      registry: "widgets",
      key: "text",
      expectedOwner: "antd",
      replacementOwner: "app",
    },
  ],
});
```

```tsx
<FormRenderer form={form} environment={environment} adapterId="antd" />
```

冲突键是 `(adapterId, registryKind, key)`。重复默认失败；替换必须给出精确 expected/replacement owner。wildcard 与未消费 override 都会阻断构建。

## Custom render

Custom Widget 只能拿到 readonly descriptor、snapshots、scope view 与 `setValue` / `touch` / `focus` / `blur`。不要传入 `FormInstance`、Store writer 或 native event。不要把 React component 写进 `defineWidget()` 或 Core `FormEnvironment`。

`RenderScope` / `InstanceBinding` / `getRenderScope()` 从 `@xunserver-jsf/core/runtime` 导入。Group 折叠与 Tab 只读写 Core `collapsed` / `activeTab`。

## SSR 与 StrictMode

服务端只读一次 committed snapshot，不访问 `window` / `document`，不安装 Runtime subscription。客户端 hydrate 后重读并订阅。React key 使用 `ViewNodeId` 与 `ArrayItemId`。若 server/client 要复用同一 item 身份，必须恢复 Core 提供的同一 identity snapshot。

可注入 `idPrefix`。StrictMode remount 不得泄漏 subscription。

## 只读 hooks

`useFormSnapshot`、`useFieldSnapshot`、`useViewSnapshot`、`usePresentableErrors`、`useArraySnapshot` 等从 `@xunserver-jsf/react` 根入口导出，内部仍通过 Core runtime selector 订阅。
