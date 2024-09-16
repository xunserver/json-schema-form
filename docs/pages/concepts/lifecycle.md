# 生命周期与 Environment

```text
defineForm()     组装四份契约，无副作用
    │
compileForm()    冻结 CompiledFormModel（data / ui / rule / validation / dynamics）
    │
createForm()     事务 Runtime：command → snapshot
    │
FormRenderer     遍历 viewTree，只读 snapshot，通过 command 写回
```

有两套 Environment，不要当成 rjsf 的单一 registry。

| 层 | 对象 | 装什么 | 入口 |
|---|---|---|---|
| Core | `FormEnvironment` | 逻辑 Widget、validator、rule function… | `@xunserver-jsf/core/extension` |
| Renderer | `VueRendererEnvironment` / `ReactRendererEnvironment` | `render()`：widgets / layouts / form / fieldChrome | `@xunserver-jsf/vue` 或 `@xunserver-jsf/react` |

`compileForm` 与 `createForm` 必须使用 **同一个** Core Environment identity。默认路径（不传 environment）共用内置默认 Environment。显式 Plugin 时不要各构建一份「长得像」的对象。

Renderer 不解释 Schema、Rule 或 Validation 来源。Compiled Model 不可变，不能在运行时改 Model。
