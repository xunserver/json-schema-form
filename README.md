# JSON Schema Form

以 JSON Schema 为数据契约的表单引擎。当前仓库完成的是 pnpm/TypeScript 工作区、六个首期 package 边界，以及 `@form/core` 的框架无关公共契约：无副作用的 `defineForm()`、可诊断的冻结 `FormEnvironment`、把 Draft 2020-12 Schema / UI Schema / Rule AST / Schema Dynamics 编译为不可变静态模型的 `compileForm()`，以及事务化的 `createForm()` / `createFormEngine()` Runtime（含 Rule 求值、activation、effective state 与 `serialize()`）。完整 Validation owner、async Rule 和 Renderer 仍由后续垂直切片交付。

架构基线见 [`docs/architecture.md`](docs/architecture.md)。工作区命令、package 职责和公共 export 规则见 [`docs/workspace.md`](docs/workspace.md)。

## 首期 package

| Package | 职责 |
|---|---|
| `@form/core` | 框架无关的 Definition、静态编译、Compiled Model、事务化 Runtime、Diagnostic、`defineForm()` / `compileForm()` / `createForm()` 与 Extension Environment |
| `@form/validator-ajv` | AJV Validator Adapter 边界；首期唯一允许引入 AJV 的 package |
| `@form/vue` | Vue Renderer 边界，只依赖 Core 与 Vue peer |
| `@form/react` | React Renderer 边界，只依赖 Core 与 React peer |
| `@form/element-plus` | Element Plus UI Adapter 边界，位于 Vue Renderer 之上 |
| `@form/mui` | MUI UI Adapter 边界，位于 React Renderer 之上 |

## 允许的依赖方向

```text
@form/validator-ajv ------> @form/core
@form/vue ----------------> @form/core
@form/react --------------> @form/core
@form/element-plus -------> @form/vue + @form/core
@form/mui ----------------> @form/react + @form/core
```

`@form/core` 不得依赖 Vue、React、DOM UI library 或 AJV。Vue/React 与 UI library 只作为对应集成 package 的 peer dependency。

## 常用命令

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm check:boundaries
pnpm verify
```

`pnpm verify` 按依赖顺序构建六个 package，并执行类型检查、契约测试与跨 package 边界检查。

## Definition 与编译

`defineForm()` 只做 authoring，不编译、不创建 Runtime、也不注册全局状态。`compileForm(definition)` 使用默认 Core Environment；需要业务 Plugin 时，从 `@form/core/extension` 显式构建同一个冻结 `FormEnvironment` 并传入 `compileForm(definition, { environment })`。编译不修改输入，也不访问 global registry。

静态 `ModelPath` 使用 `products[].name`、转义 property 的 JSON-string bracket，以及 tuple 的 `[#n]`；`products[0]` 属于 Runtime `InstancePath`，不会出现在 Compiled DataModel。Field Registry 与 ViewTree 分离：检查 Field 用 `model.ui.fields`，检查呈现结构用已解析的 `model.ui.viewTree`。来自 Object property edge 的 Field 带有只读 `requirement` presentation source（`required` / `optional` / `conditional`）；`required` 不是 `FieldUI` 成员。实例级 effective `required` 由 Runtime 在 activation 之后组合进 Field/View snapshot：`required = active && (static required || (conditional && activationSource.active))`。`visible` / `disabled` / `readonly`、Widget props、`native` 与 Validation error 都不参与该组合。Renderer/FieldChrome 只读该 snapshot，不读取 Schema 或 DataModel edge。

自定义逻辑 Widget 使用 `@form/core/extension` 的 `defineWidget()`：它只保留 identity 与 literal inference，不安装 Registry。`WidgetDefinition.interaction` 以纯数据声明 `setValue` / `touch` / `focus` / `blur`；Renderer 通过 Core 公开 command `setValue()` / `touch()` / `focus()` / `blur()` 实现这些动作。`RenderScope` / `InstanceBinding` / `getRenderScope()` 与 effective `required` snapshot 已由 Core Runtime 提供。已声明 `x-*` 拆分与非 Draft 2020-12 dialect adapter 由 `align-core-contributions-and-layout` 承接。

`FormDefinition.rules` 使用 JSON-compatible 的 `RuleExpression` AST（scalar / `{ const }` / `{ field }` / `{ call, args }` / 固定 operator），分为 State、Computed、Validation、Effect 四类。named function 只通过 `@form/core/extension` 的 `defineRuleFunction()` 注册到 Environment，Compiled Model 只保存 function key。数组 Rule 按同一 item 的相对 `ModelPath` 绑定，不接受无法唯一确定的 sibling/descendant collection。`oneOf`/`anyOf`/`if`/`dependentSchemas` 编译为有限 activation plan；无法保真的 predicate 在编译期阻断。

effective `active` 由 ancestor、Schema activation 与 active Rule 以 AND 组成（root 恒为 active）；`visible` 再 AND UI/Rule visible，因此 hidden 仍可保持 active。`disabled`/`readonly` 以 OR 组成，Computed target 强制 readonly。`serialize()` 默认按 Compiled `serializeInactive`（缺省 false）做 active-only prune，显式 `{ includeInactive }` 或 named Serializer key 可覆盖；serialize 不看 visible/disabled/readonly。Validation Rule 只产生后续 owner 的 plan，本切片不提供 `validate()` / `valid` / 完整 AJV Validation。

```ts
import { compileForm, CompileError, defineForm } from "@form/core";
import {
  createFormEnvironment,
  definePlugin,
  defineRuleFunction,
  defineWidget,
  EnvironmentBuildError,
} from "@form/core/extension";

const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      products: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" } },
        },
      },
    },
  },
  uiSchema: {
    fields: {
      "products[].name": { display: { label: "Name" } },
    },
  },
});

const { model, diagnostics } = compileForm(definition);
void model.data.nodes.get("products[].name");
void model.ui.fields.get("products[].name")?.widget;
void model.ui.fields.get("products[].name")?.requirement;
void model.ui.viewTree;
void diagnostics;

const companyPlugin = definePlugin({
  id: "company",
  dependsOn: ["core"],
  contributes: {
    widgets: {
      sku: defineWidget({
        name: "sku",
        valueContract: {
          jsonTypes: ["string"],
          canonical: "json-scalar",
        },
        interaction: { setValue: true, touch: true, focus: true, blur: true },
      }),
    },
    ruleFunctions: {
      "company.tax": defineRuleFunction({
        name: "company.tax",
        evaluate: (args) => args[0] ?? 0,
      }),
    },
  },
});

try {
  const environment = createFormEnvironment({ plugins: [companyPlugin] });
  const compiled = compileForm(definition, { environment });
  void compiled.model;
} catch (error) {
  if (error instanceof EnvironmentBuildError || error instanceof CompileError) {
    void error.diagnostics;
  }
}
```

## Runtime

`createForm(model, { initialValues })` 使用与 `compileForm(definition)` 相同的默认 Core Environment。显式 Environment 必须在 compile 与 create 之间保持同一 identity，不能靠 Plugin 列表结构相等来匹配。需要长期复用同一套 Plugin 时，使用 `createFormEngine({ plugins })`：`engine.compile()` 与 `engine.create()` 闭包持有同一个冻结 Environment，Engine 本身不保存实例 values 或 version。

公开 snapshot 只读。`setValues(nextValues)` 是一次原子的 root replacement，不是隐式 deep-merge。写入必须经过 command/transaction；effective no-op 不增加 `version`。四个 semantic command 是 `setValue` / `touch` / `focus` / `blur`：`touch()` 以 Field `InstancePath` 为目标，`focus()` / `blur()` / `setCollapsed()` / `setActiveTab()` 以具体 `ViewNodeId` 为目标。`blur()` 只清除该 View 的 focused，不隐式 touch，也不修改 values。View source state 还包括 `collapsed`（默认 `false`）与 `activeTab`（默认 `undefined`）；`reset()` 将它们恢复默认值，数组 item 删除时随 subtree 清理。Core 不解释 tab key 是否存在于 layout，也不实现 Validation `blur` trigger 或 Renderer 的 DOM focus 策略。

`FormInstance.array(path)` 与 `scope(path)` 返回共享同一 Runtime 的轻量 facade。数组 index 只是当前地址，`ArrayItemId` 才是 item 身份：`move` 后 Field/View source state 跟随 ID，`remove`/`replaceItem`/`reset` 以及默认 whole-array `setValue` 会作废旧 ID 与 scope。`setItemValue` 保留根 item ID；未配置 Identity Resolver 时，有效的整个数组替换会重建全部 item ID，而不会按 index 或业务字段猜测复用。可在 `createForm` 选项中按数组 `ModelPath` 提供纯同步 `ArrayIdentityResolver`（从 `@form/core/runtime` 导入类型）做 key reconcile；重复 key 或抛错会使 transaction 回滚。固定 tuple 现存 slot 可 `setItemValue`/`replaceItem`，但不支持 append/insert/remove/move/clear。

`createForm()` 在返回实例前会无 publish 地稳定 Computed/Effect/activation，`version` 仍为 0，稳定后的 values 作为 dirty baseline。`FormInstance.serialize(options?)` 读取已提交 snapshot；默认 active-only。不要假设存在 async Rule、完整 Validation 或 Renderer：Core 不提供 `validate()` / `submit()`，也不渲染 UI。

只读 selector / subscription / Runtime diagnostic observer 以及 array order/item/binding selector 从 `@form/core/runtime` 导入，不从根入口重导出。`currentBindingSelector` 发布完整 `InstanceBinding`（静态 `DataNodeId`/`ModelPath`、当前 `InstancePath`、`ArrayItemId` chain 与 `stale`）。`getRenderScope(form | scoped)` 返回只读 `RenderScope`：可把相对或绝对模板 `ModelPath`（如 `products[].name`）解析为当前 `InstancePath`，并按 item/scope 派生；它没有 writer。move 后同一 scope 的 chain 不变而 path 更新；remove/replace/clear/reset 后永久 stale。不要把 `RenderScope` 当作 `FormInstance` 传给 Renderer 去绕过 command。

```ts
import { compileForm, createForm, createFormEngine, defineForm, FormRuntimeError } from "@form/core";
import { createFormEnvironment } from "@form/core/extension";
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
form.setCollapsed(model.ui.viewTree.id, false);
form.reset();
const scope = getRenderScope(form);
void scope.resolve("profile.title");
void form.getField("name").getState().required;

const environment = createFormEnvironment();
const explicit = createForm(compileForm(definition, { environment }).model, {
  environment,
  initialValues: { name: "Ada" },
});

const engine = createFormEngine();
const fromEngine = engine.create(engine.compile(definition).model, { initialValues: { name: "Ada" } });

subscribeRuntime(form, valueSelector("name"), (name) => {
  void name;
});
subscribeRuntime(form, formSelector(), (snapshot) => {
  void snapshot.version;
  void snapshot.active;
});
void form.serialize();

try {
  form.setValue("products[0].name", "x");
} catch (error) {
  if (error instanceof FormRuntimeError) {
    void error.diagnostics;
  }
}

void explicit.getState();
void fromEngine.getValues();
```
