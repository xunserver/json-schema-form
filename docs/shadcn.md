# shadcn Adapter

本文说明 `@form/shadcn` 与 `@form/react` 的公开用法。Core `FormEnvironment` 仍是 Widget 定义、规则和校验的真相；shadcn 组件本地状态与 DOM validity 不得作为业务状态。

shadcn/ui 以源码拷贝分发，因此本 adapter **不 vendor、不发布** UI 组件，也没有默认单例。消费方必须注入已有组件：

```ts
import { FormRenderer } from "@form/react";
import {
  createShadcnAdapter,
  extendShadcnAdapter,
  type ShadcnAdapterComponents,
} from "@form/shadcn";

const components: ShadcnAdapterComponents = {
  Input,
  Textarea,
  Checkbox,
  Switch,
  Button,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectValue,
  Combobox,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  Collapsible,
};

const adapter = createShadcnAdapter({ components });

<FormRenderer form={form} adapter={adapter} />
```

默认 adapter ID 为 `shadcn`。九类内置 Widget（text/textarea/number/select/multi-select/checkbox/switch/date/datetime）与四类 layout（object/array/group/layout）均有 binding。`native["shadcn"]` 可提供非保留外观选项；value、disabled、ARIA 与 semantic handlers 由 Core/Renderer 控制。缺任一必需 slot 时 `createShadcnAdapter` fail closed。

date/datetime 使用 canonical 字符串（`YYYY-MM-DD` / RFC 3339），adapter 不引入日期对象库。

## Playground

```bash
pnpm playground
```

打开 http://127.0.0.1:5173/ ，右侧 shadcn 预览帧会挂载本 adapter。该帧使用独立 Tailwind/tokens 与表单组件，不复用编辑器 chrome 的 `src/components/ui`。
