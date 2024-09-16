# Element Plus Adapter

`@form/element-plus` 位于 Vue Renderer 之上。默认 adapter ID 为 `element-plus`。Core `FormEnvironment` 仍是 Widget 定义、规则和校验的真相；Element Plus Form 的 `rules` / `validate` / `resetFields` 不得作为业务状态。

```ts
import { FormRenderer } from "@form/vue";
import {
  elementPlusAdapter,
  createElementPlusAdapter,
  extendElementPlusAdapter,
} from "@form/element-plus";
```

```vue
<FormRenderer :form="form" :adapter="elementPlusAdapter" />
```

九类内置 Widget（text / textarea / number / select / multi-select / checkbox / switch / date / datetime）与四类 layout（object / array / group / layout）均有 binding。

## native 与受保护键

`native["element-plus"]` 可提供非保留外观选项。下列键由 Core / Renderer 控制，出现在 props 或 native 中会诊断并阻止该 binding：

- `value` / `modelValue` / `defaultValue`
- `disabled` / `readonly` / `required`
- `errors` / `status` / `validateStatus`
- IDs 与 `aria-*`
- `onUpdate:modelValue` 以及 change / focus / blur handlers
- `rules` / `validate` / `resetFields` / `model`

其他 adapter namespace（例如 `antd`）会被忽略。date / datetime 使用 canonical 字符串，adapter 不引入 dayjs。

## 扩展

使用 `createElementPlusAdapter()` 得到标准 adapter，再用 `extendElementPlusAdapter({ owner, widgets })` 贡献业务 Widget，最后交给 `createVueRendererEnvironment()`。详见 [Vue Renderer](./renderer.md)。
