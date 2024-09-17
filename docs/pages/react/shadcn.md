# shadcn Adapter

| | |
|---|---|
| Package | `@xunserver-jsf/shadcn` |
| Adapter ID | `shadcn` |
| 默认单例 | **无**。必须 `createShadcnAdapter({ components })` |
| 扩展 | `extendShadcnAdapter` |
| native | `native["shadcn"]` |
| 日期 | canonical 字符串 |

shadcn/ui 以源码拷贝分发，本 adapter 不 vendor UI 组件。缺任一必需槽会抛 `ShadcnAdapterConfigurationError`。槽列表：`REQUIRED_SHADCN_SLOTS`。

```tsx
import { createShadcnAdapter, type ShadcnAdapterComponents } from "@xunserver-jsf/shadcn";

const adapter = createShadcnAdapter({
  components: {
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
    Card,
  } satisfies ShadcnAdapterComponents,
});
```

```tsx
<FormRenderer form={form} adapter={adapter} />
```

Playground 预览帧使用独立 Tailwind / tokens，不复用编辑器 chrome 的 `src/components/ui`。
