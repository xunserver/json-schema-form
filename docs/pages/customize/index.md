# 选择定制层级

从浅到深改。能停在上一层就不要写 Plugin。

| 级 | 你改什么 | 典型入口 |
|---|---|---|
| L0 | 只写 Schema | 默认 widget + 默认 ViewTree |
| L1 | `uiSchema.fields` | label / widget / props / behavior / `native` |
| L2 | `uiSchema.layout`、`field: false` | 分组、栅格、数组区域 |
| L3 | `config` + `rules` | 校验时机、条件显示、计算字段 |
| L4 | Core Plugin | `defineWidget` / validator / ruleFunction（**没有 UI**） |
| L5 | Adapter 工厂追加 | `create*Adapter({ widgets })`，**不会覆盖**已有 key |
| L6 | 精确 override | `extend*Adapter` + Renderer Environment `overrides` |
| L7 | 整份 Adapter | 换叶子包，或 `defineVueUIAdapter` / `defineReactUIAdapter`（才能换 fieldChrome / form） |

[字段](/guide/fields)、[布局](/guide/layout)、[规则](/guide/rules) 覆盖 L0–L3。下面三页覆盖 L4–L7。

## 做不到（相对 rjsf）

- 没有 `fields` map 把某个 schema 节点换成自定义 Field 类
- 没有 `templates` / `Theme` 对象；最接近 theme 的是整份 UI Adapter
- Custom widget **拿不到** `FormInstance`、Store、native event；只能用 snapshots + `setValue` / `touch` / `focus` / `blur`
- 公开可替换的是 Adapter 的 `widgets` / `layouts` / `fieldChrome` / `form`，不是 `ObjectRenderer` 组件本身
