# 四份契约

`defineForm()` 只 authoring。

| 字段 | 职责 |
|---|---|
| `schema` | 数据契约。Canonical dialect 是 Draft 2020-12。 |
| `uiSchema` | 呈现契约。逻辑 widget、label、layout；不拥有 values。 |
| `rules` | State / Computed / Validation / Effect 的 JSON AST。 |
| `config` | `schemaValidator`、`validateOn`、`errorPresentation`、`serializer`、`valueInitializer`。 |

`FieldUI` 常用字段：`widget`、`display`（label / help / tooltip / labelMode）、`props`、`behavior`、`native[adapterId]`、`field: false`。

`required` 不是 `FieldUI` 成员。静态 requirement 来自 Schema property edge；实例级 effective `required` 在 Runtime snapshot 里。
