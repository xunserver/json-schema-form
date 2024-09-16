# Effective state

公开 snapshot 只读。mutation 必须走 Runtime command；effective no-op 不增加 `version`。

| 字段 | 组合 |
|---|---|
| `active` | ancestor ∧ Schema activation ∧ active Rule（root 恒 active） |
| `visible` | 再 ∧ UI/Rule visible，因此 hidden 仍可 active |
| `disabled` / `readonly` | OR；computed target 强制 readonly |
| `required` | `active && (static required \|\| (conditional && activationSource.active))` |

`visible` / `disabled` / `readonly`、widget props、`native` 与校验错误都不参与 `required` 组合。FieldChrome 只读 snapshot。

`serialize()` 默认按 active prune，不看 visible。
