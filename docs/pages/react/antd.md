# Ant Design Adapter

| | |
|---|---|
| Package | `@xunserver-jsf/antd` |
| Adapter ID | `antd` |
| 默认单例 | `antdAdapter` |
| 工厂 / 扩展 | `createAntdAdapter` / `extendAntdAdapter` |
| native | `native["antd"]` |
| 日期 | `YYYY-MM-DD` / RFC 3339 字符串，不引入 dayjs |

Widget / layout 集合与其它叶子 Adapter 相同。不要用 Ant Design Form model / DOM validity 当业务状态。

```tsx
<FormRenderer form={form} adapter={antdAdapter} />
```
