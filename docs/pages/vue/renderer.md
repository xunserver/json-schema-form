# Vue Renderer

`@xunserver-jsf/vue` 只依赖 Core 与 Vue peer。它遍历 `viewTree`，读 snapshot，经 Core command 写回。

## FormRenderer props

| Prop | 说明 |
|---|---|
| `form` | `FormInstance` |
| `adapter` | 与下一组二选一 |
| `environment` + `adapterId` | 多 Adapter / override 时用 |
| `idPrefix` | 可选；默认 Vue SSR-safe `useId()` |
| `submitHandler` | 交给 `form.submit` |
| `onDiagnostic` | Adapter / capability 诊断 |

```vue
<FormRenderer :form="form" :adapter="elementPlusAdapter" :submit-handler="onSubmit" />
```

## 只读 composables

`useFormSnapshot`、`useFieldSnapshot`、`useViewSnapshot`、`usePresentableErrors`、`useArraySnapshot`、`useArrayItem`、`useArrayOrder`、`useCurrentBinding`、`useRuntimeSelector`。

## SSR

服务端只读一次 committed snapshot，不访问 `window` / `document`，不装 subscription。客户端 `onMounted` 后订阅。key 用 `ViewNodeId` 与 `ArrayItemId`。复用身份必须恢复同一 identity snapshot。

定制见 [追加与覆盖](/customize/override)、[自建 Adapter](/customize/adapter)。
