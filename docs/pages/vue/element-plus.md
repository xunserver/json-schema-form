# Element Plus Adapter

| | |
|---|---|
| Package | `@xunserver-jsf/element-plus` |
| Adapter ID | `element-plus` |
| 默认单例 | `elementPlusAdapter` |
| 工厂 | `createElementPlusAdapter({ widgets, layouts })` 只**追加** key |
| 扩展 | `extendElementPlusAdapter({ owner, widgets, layouts })` |
| native | `native["element-plus"]` |
| 日期 | canonical 字符串，不引入 dayjs |

九类 widget：`text` `textarea` `number` `select` `multi-select` `checkbox` `switch` `date` `datetime`。四类 layout：`object` `array` `group` `layout`。

受保护键见导出的 `PROTECTED_NATIVE_KEYS`（value / disabled / ARIA / handlers / `rules` `validate` `model` 等）。Core 仍是校验真相，不要用 Element Plus Form 的 `validate()` 当业务状态。

```vue
<FormRenderer :form="form" :adapter="elementPlusAdapter" />
```
