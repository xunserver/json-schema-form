# Arco Design Vue Adapter

| | |
|---|---|
| Package | `@xunserver-jsf/arco-vue` |
| Adapter ID | `arco-vue` |
| 默认单例 | `arcoVueAdapter` |
| 工厂 / 扩展 | `createArcoVueAdapter` / `extendArcoVueAdapter` |
| native | `native["arco-vue"]` |
| 日期 | canonical 字符串 |

Widget / layout 集合与 Element Plus 相同。受保护键见 `PROTECTED_NATIVE_KEYS`。

```vue
<FormRenderer :form="form" :adapter="arcoVueAdapter" />
```
