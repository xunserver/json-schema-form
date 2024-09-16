# Arco Design Vue Adapter

本文说明 `@form/arco-vue` 与 `@form/vue` 的公开用法。Core `FormEnvironment` 仍是 Widget 定义、规则和校验的真相；Arco Form 的 model / validate 不得作为业务状态。

```ts
import { FormRenderer } from "@form/vue";
import { arcoVueAdapter, createArcoVueAdapter, extendArcoVueAdapter } from "@form/arco-vue";
```

默认 adapter ID 为 `arco-vue`。九类内置 Widget 与四类 layout 均有 binding。`native["arco-vue"]` 可提供非保留外观选项。

date/datetime 使用 canonical 字符串，adapter 不引入 dayjs。

## Playground

```bash
pnpm playground
```

打开 http://127.0.0.1:5173/ ，右侧 Arco Vue 预览帧会挂载本 adapter。
