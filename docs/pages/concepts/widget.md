# Widget 双层

| 层 | 是什么 | 不是什么 |
|---|---|---|
| Core `defineWidget` | 名字 + `valueContract` + `interaction` | 不是 Vue/React 组件 |
| Adapter `WidgetBinding` | codec + `render()` | 不是 Schema 解释器 |

内置逻辑名：`text` `textarea` `number` `select` `multi-select` `checkbox` `switch` `date` `datetime`。匹配规则：string→text，number→number，enum→select，boolean→checkbox，`format: date` / `date-time` 对应日期控件。

Renderer 的 Field 路径只解析 widget、调 command。本库没有 rjsf 那种可替换 Field 类表。
