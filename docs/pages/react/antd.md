# Ant Design Adapter

`@xunserver-jsf/antd` 位于 React Renderer 之上。默认 adapter ID 为 `antd`。Core `FormEnvironment` 仍是 Widget、规则和校验的真相；Ant Design Form 的 model / validate / DOM validity 不得作为业务状态。

```tsx
import { FormRenderer } from "@xunserver-jsf/react";
import { antdAdapter, createAntdAdapter, extendAntdAdapter } from "@xunserver-jsf/antd";
```

```tsx
<FormRenderer form={form} adapter={antdAdapter} />
```

九类内置 Widget（text / textarea / number / select / multi-select / checkbox / switch / date / datetime）与四类 layout（object / array / group / layout）均有 binding。

## native 与受保护键

`native["antd"]` 可提供非保留外观选项。value、disabled、ARIA 与 semantic handlers 由 Core / Renderer 控制，出现在 props 或 native 中会诊断并阻止该 binding。其他 adapter namespace 会被忽略。

date / datetime 使用 canonical 字符串（`YYYY-MM-DD` / RFC 3339），adapter 不引入 dayjs。

## 扩展

使用 `createAntdAdapter()` 得到标准 adapter，再用 `extendAntdAdapter({ owner, widgets })` 贡献业务 Widget，最后交给 `createReactRendererEnvironment()`。详见 [React Renderer](./renderer.md)。
