# shadcn Adapter

`@xunserver-jsf/shadcn` 位于 React Renderer 之上。默认 adapter ID 为 `shadcn`。Core `FormEnvironment` 仍是 Widget、规则和校验的真相；shadcn 组件本地状态与 DOM validity 不得作为业务状态。

shadcn/ui 以源码拷贝分发，因此本 adapter **不 vendor、不发布** UI 组件，也没有默认单例。消费方必须注入已有组件：

```tsx
import { FormRenderer } from "@xunserver-jsf/react";
import {
  createShadcnAdapter,
  extendShadcnAdapter,
  type ShadcnAdapterComponents,
} from "@xunserver-jsf/shadcn";

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
```

```tsx
<FormRenderer form={form} adapter={adapter} />
```

九类内置 Widget 与四类 layout 均有 binding。`native["shadcn"]` 可提供非保留外观选项；value、disabled、ARIA 与 semantic handlers 由 Core / Renderer 控制。缺任一必需 slot 时 `createShadcnAdapter` fail closed。date / datetime 使用 canonical 字符串，adapter 不引入日期对象库。

Playground 的 shadcn 预览帧使用独立 Tailwind / tokens 与表单组件，不复用编辑器 chrome 的 `src/components/ui`。扩展方式与 Ant Design 相同：`extendShadcnAdapter()` + `createReactRendererEnvironment()`。Renderer 契约见 [React Renderer](./renderer.md)。
