# Arco Design React Adapter

`@xunserver-jsf/arco-react` 位于 React Renderer 之上。默认 adapter ID 为 `arco-react`。Core `FormEnvironment` 仍是 Widget、规则和校验的真相；Arco Form 的 model / validate / DOM validity 不得作为业务状态。

```tsx
import { FormRenderer } from "@xunserver-jsf/react";
import {
  arcoReactAdapter,
  createArcoReactAdapter,
  extendArcoReactAdapter,
} from "@xunserver-jsf/arco-react";
```

```tsx
<FormRenderer form={form} adapter={arcoReactAdapter} />
```

九类内置 Widget 与四类 layout 均有 binding。`native["arco-react"]` 可提供非保留外观选项；value、disabled、ARIA 与 semantic handlers 由 Core / Renderer 控制。date / datetime 使用 canonical 字符串，adapter 不引入 dayjs。

扩展方式与 Ant Design 相同：`createArcoReactAdapter()` / `extendArcoReactAdapter()` + `createReactRendererEnvironment()`。Renderer 契约见 [React Renderer](./renderer.md)。
