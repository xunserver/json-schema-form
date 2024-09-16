# Runtime

`createForm(model, { initialValues })` 使用与 `compileForm(definition)` 相同的默认 Core Environment。显式 Environment 必须在 compile 与 create 之间保持同一 identity，不能靠 Plugin 列表结构相等来匹配。

需要长期复用同一套 Plugin 时，使用 `createFormEngine({ plugins })`：`engine.compile()` 与 `engine.create()` 闭包持有同一个冻结 Environment。Engine 本身不保存实例 values 或 version。

```ts
import { compileForm, createForm, createFormEngine, defineForm, FormRuntimeError } from "@form/core";
import { formSelector, getRenderScope, subscribeRuntime, valueSelector } from "@form/core/runtime";

const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      profile: {
        type: "object",
        properties: { title: { type: "string" } },
      },
    },
  },
});

const { model } = compileForm(definition);
const form = createForm(model, { initialValues: { name: "Ada" } });
form.setValue("profile.title", "Engineer");
form.setValues({ name: "Grace", profile: { title: "Admiral" } });
form.focus(model.ui.viewTree.id);
form.blur(model.ui.viewTree.id);
form.reset();

subscribeRuntime(form, valueSelector("name"), (name) => {
  void name;
});
void form.serialize();
```

## Command 与事务

公开 snapshot 只读。所有 mutation 必须经过 Runtime command / transaction；effective no-op 不增加 `version`。

| Command | 目标 |
|---|---|
| `setValue` / `setValues` | 业务 values。`setValues` 是一次原子 root replacement，不是 deep-merge。 |
| `touch` | Field `InstancePath` |
| `focus` / `blur` / `setCollapsed` / `setActiveTab` | 具体 `ViewNodeId` |

`blur()` 只清除该 View 的 focused，不隐式 touch，也不修改 values。`reset()` 恢复 dirty 基线，并把 `focused` / `collapsed` / `activeTab` 恢复默认值。

## Effective state

- `active`：ancestor、Schema activation 与 active Rule 以 AND 组成（root 恒为 active）
- `visible`：再 AND UI/Rule visible，因此 hidden 仍可保持 active
- `disabled` / `readonly`：以 OR 组成；Computed target 强制 readonly
- effective `required`：`active && (static required || (conditional && activationSource.active))`

Renderer / FieldChrome 只读 snapshot，不读取 Schema 或 DataModel edge。`visible` / `disabled` / `readonly`、Widget props、`native` 与 Validation error 都不参与 `required` 组合。

## serialize

`FormInstance.serialize(options?)` 读取已提交 snapshot。默认按 Compiled `serializeInactive`（缺省 false）做 active-only prune。显式 `{ includeInactive }` 或 named Serializer key 可覆盖。serialize 不看 visible / disabled / readonly。

## 只读 Runtime API

selector / subscription / `RenderScope` / `InstanceBinding` 从 `@form/core/runtime` 导入，不从根入口重导出。

`getRenderScope(form | scoped)` 返回只读 `RenderScope`：可把相对或绝对模板 `ModelPath` 解析为当前 `InstancePath`。它没有 writer。不要把 `RenderScope` 当作 `FormInstance` 传给 Renderer 去绕过 command。
