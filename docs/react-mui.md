# React Renderer 与 MUI Adapter

本文说明 `@form/react` 与 `@form/mui` 的公开用法。Core `FormEnvironment` 仍是 Widget 定义、规则和校验的真相；MUI FormControl 的 `error` / DOM `validity` 不得作为业务状态。

## 简单路径

```ts
import { defineForm, compileForm, createForm } from "@form/core";
import { FormRenderer } from "@form/react";
import { muiAdapter } from "@form/mui";
import { createElement } from "react";

const { model } = compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } }));
const form = createForm(model, { initialValues: { name: "Ada" } });
export const element = createElement(FormRenderer, { form, adapter: muiAdapter });
```

`FormRenderer` 只接收已实例化的 `form` 与 adapter 选择，不会隐式 compile Definition。

## 高级路径：RendererEnvironment

`defineReactUIAdapter()` 只规范化描述，不安装全局 Registry。`createReactRendererEnvironment()` 先校验 adapter ID、protocol、四类 role、registry key 与 override，再冻结发布。

```ts
import { createReactRendererEnvironment } from "@form/react";
import { createMuiAdapter, extendMuiAdapter } from "@form/mui";

export const environment = createReactRendererEnvironment({
  adapters: [createMuiAdapter()],
  contributions: [extendMuiAdapter({ owner: "app" })],
  overrides: [
    {
      adapterId: "mui",
      registry: "widgets",
      key: "text",
      expectedOwner: "mui",
      replacementOwner: "app",
    },
  ],
});
```

```ts
import { FormRenderer } from "@form/react";
import { createElement } from "react";
import type { FormInstance } from "@form/core";
import type { ReactRendererEnvironment } from "@form/react";

export function renderAdvanced(form: FormInstance, environment: ReactRendererEnvironment) {
  return createElement(FormRenderer, { form, environment, adapterId: "mui" });
}
```

冲突键是 `(adapterId, registryKind, key)`。重复默认失败；替换必须给出精确 expected/replacement owner。wildcard 与未消费 override 都会阻断构建。

## useSyncExternalStore、StrictMode 与 SSR

只读 hooks 通过 Core 公开 selector 的 `subscribe` / `getSnapshot` / `getServerSnapshot` 桥接。语义未变时 `Object.is` 保持同一 snapshot，不在 React 层 deep clone。

- Render phase 不注册 environment、不调用 command。
- StrictMode 的 setup-cleanup-setup 必须平衡；任一时刻最多一个 listener。
- 服务端只读 committed snapshot，不访问 `window` / `document`，不安装 Runtime subscription。
- 客户端 `hydrateRoot` 必须使用相同 compiled model、adapter、初始 committed state 与 `identifierPrefix`。
- React key 使用 `ViewNodeId` 与 `ArrayItemId`；`ArrayItemId` 不渲染为不稳定 DOM 文本。

## Custom render

Custom Widget 只能拿到 readonly descriptor、snapshots、scope view 与 `setValue` / `touch` / `focus` / `blur`。不要传入 `FormInstance`、Store writer 或 native event。

## 受保护的 MUI native keys

`native["mui"]` 可提供非保留外观选项。下列键由 Core/Renderer 控制，出现在 props 或 native 中会诊断并阻止该 binding：

- `value` / `defaultValue` / `checked` / `defaultChecked`
- `disabled` / `readonly` / `readOnly` / `required` / `error`
- IDs 与 `aria-*`
- `onChange` / `onInput` / `onFocus` / `onBlur`

其他 adapter namespace（例如 `element-plus`）会被忽略。默认 datetime 使用 RFC 3339 文本 binding，不引入 MUI X 或 `Date`。

## 与 Core 的边界

- Renderer 只遍历 `CompiledFormModel.ui.viewTree`。
- `RenderScope` / `InstanceBinding` / `getRenderScope()` 从 `@form/core/runtime` 导入。
- Group 折叠与 Tab 只读写 Core `collapsed` / `activeTab`。
- 不要把 React component 写进 `defineWidget()` 或 Core `FormEnvironment`。
- 业务 values、errors、validating 与 submit 只来自 Core。
