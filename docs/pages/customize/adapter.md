# 自建 Adapter（L7）

换整套 UI：把 `elementPlusAdapter` 换成 `antdAdapter` / `createShadcnAdapter({ components })`。同一 Core `FormInstance` 可交给不同叶子包。

要换 label 外壳（FieldChrome）或 `<form>` 外壳，`create*Adapter()` **不够**：工厂不能替换 `fieldChrome` / `form`。必须 `defineVueUIAdapter` / `defineReactUIAdapter` 提供四个角色：

| 角色 | 职责 |
|---|---|
| `form` | 宿主 form + submit |
| `fieldChrome` | label / required / help / presentable errors |
| `widgets` | 九类内置 + 业务控件 |
| `layouts` | `object` / `array` / `group` / `layout` |

shadcn 没有默认单例：必须注入宿主组件槽，缺槽 fail closed。见 [shadcn](/react/shadcn)。

协议、adapter ID、registry key 在 `createVueRendererEnvironment` / `createReactRendererEnvironment` 构建时校验并冻结。不要在运行时改 Adapter 对象。
