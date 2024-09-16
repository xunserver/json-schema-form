# React Renderer

`@xunserver-jsf/react` 只依赖 Core 与 React peer。

## FormRenderer props

| Prop | 说明 |
|---|---|
| `form` | `FormInstance` |
| `adapter` | 与下一组二选一 |
| `environment` + `adapterId` | 多 Adapter / override 时用 |
| `identifierPrefix` | 可选 id 前缀 |
| `submitHandler` | 交给 `form.submit` |
| `onDiagnostic` | 诊断回调 |

```tsx
<FormRenderer form={form} adapter={antdAdapter} submitHandler={onSubmit} />
```

## 只读 hooks

与 Vue 对称：`useFormSnapshot`、`useFieldSnapshot`、`useViewSnapshot`、`usePresentableErrors`、`useArraySnapshot`、`useArrayItem`、`useArrayOrder`、`useCurrentBinding`、`useRuntimeSelector`。

## SSR 与 StrictMode

服务端只读 committed snapshot。hydrate 后订阅。StrictMode remount 不得泄漏 subscription。key 用 `ViewNodeId` 与 `ArrayItemId`。

定制见 [追加与覆盖](/customize/override)、[自建 Adapter](/customize/adapter)。
