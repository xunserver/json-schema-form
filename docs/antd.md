# Ant Design Adapter

本文说明 `@form/antd` 与 `@form/react` 的公开用法。Core `FormEnvironment` 仍是 Widget 定义、规则和校验的真相；Ant Design Form 的 model / validate / DOM validity 不得作为业务状态。

```ts
import { FormRenderer } from "@form/react";
import { antdAdapter, createAntdAdapter, extendAntdAdapter } from "@form/antd";
```

默认 adapter ID 为 `antd`。九类内置 Widget（text/textarea/number/select/multi-select/checkbox/switch/date/datetime）与四类 layout（object/array/group/layout）均有 binding。`native["antd"]` 可提供非保留外观选项；value、disabled、ARIA 与 semantic handlers 由 Core/Renderer 控制。

date/datetime 使用 canonical 字符串（`YYYY-MM-DD` / RFC 3339），adapter 不引入 dayjs。

## Playground

```bash
pnpm playground
```

打开 http://127.0.0.1:5173/ ，右侧 Ant Design 预览帧会挂载本 adapter。
