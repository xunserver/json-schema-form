# Arco Design Vue Adapter

`@xunserver-jsf/arco-vue` 位于 Vue Renderer 之上。默认 adapter ID 为 `arco-vue`。Core `FormEnvironment` 仍是 Widget、规则和校验的真相；Arco Form 的 model / validate 不得作为业务状态。

```ts
import { FormRenderer } from "@xunserver-jsf/vue";
import {
  arcoVueAdapter,
  createArcoVueAdapter,
  extendArcoVueAdapter,
} from "@xunserver-jsf/arco-vue";
```

```vue
<FormRenderer :form="form" :adapter="arcoVueAdapter" />
```

九类内置 Widget 与四类 layout 均有 binding。`native["arco-vue"]` 可提供非保留外观选项；value、disabled、ARIA 与 semantic handlers 由 Core / Renderer 控制。date / datetime 使用 canonical 字符串，adapter 不引入 dayjs。

扩展方式与 Element Plus 相同：`createArcoVueAdapter()` / `extendArcoVueAdapter()` + `createVueRendererEnvironment()`。Renderer 契约见 [Vue Renderer](./renderer.md)。
