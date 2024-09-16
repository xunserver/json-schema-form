# JSON Schema Form

以 JSON Schema 为数据契约的表单引擎。当前仓库完成的是 pnpm/TypeScript 工作区、六个首期 package 边界，以及 `@form/core` 的框架无关公共契约：无副作用的 `defineForm()`、可诊断的冻结 `FormEnvironment`、把 Draft 2020-12 Schema / UI Schema / Rule AST / Schema Dynamics 编译为不可变静态模型的 `compileForm()`，事务化的 `createForm()` / `createFormEngine()` Runtime（含 Rule 求值、activation、effective state 与 `serialize()`），以及 Core 拥有的 Validation pipeline（`validate()` / `applyErrors()` / `submit()`，AJV 只存在于 `@form/validator-ajv`）。Vue/Element Plus 与 React/MUI 两条渲染链路已交付，分别见 `examples/vue-element-plus` 与 `examples/react-mui`。

架构基线见 [`docs/architecture.md`](docs/architecture.md)。工作区命令、package 职责、公共 export 规则以及 `packages/core/src` 的领域目录见 [`docs/workspace.md`](docs/workspace.md)。

## 首期 package

| Package | 职责 |
|---|---|
| `@form/core` | 框架无关的 Definition、静态编译、Compiled Model、事务化 Runtime、Diagnostic、`defineForm()` / `compileForm()` / `createForm()` 与 Extension Environment |
| `@form/validator-ajv` | Draft 2020-12 Schema Validator Adapter；首期唯一允许引入 AJV 的 package |
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
pnpm check:v1-matrix
pnpm verify
pnpm verify:v1
pnpm playground:react
pnpm playground:vue
```

`pnpm verify` 按依赖顺序构建六个 package，并执行类型检查、契约测试、跨 package 边界检查与两个 example smoke。`pnpm verify:v1` 是架构第 3/16–21 节的发布门禁：先核对 coverage matrix 与 prerequisite，再跑边界、build/typecheck/unit、跨栈集成、SSR/browser/examples 与文档证据。本地 `verify:v1` **不会**删除或重装开发者 workspace；干净 checkout 由 CI 执行 `pnpm install --frozen-lockfile` 后再跑同一门禁。覆盖索引见 [`docs/generated/v1-coverage.md`](docs/generated/v1-coverage.md)。

### Playground 工作台

两个 example 各自提供可浏览的 Vite 工作台（互不混跑，避免 React/MUI 与 Vue/Element Plus 同页冲突）：

| 命令 | 地址 | 栈 |
|---|---|---|
| `pnpm playground:react` | http://127.0.0.1:5173/ | React + MUI |
| `pnpm playground:vue` | http://127.0.0.1:5174/ | Vue + Element Plus |

左侧可编辑 `schema` / `uiSchema` / `rules` / `config` / `formData`（JSON 文本）；右侧实时预览本栈 `FormRenderer`，并展示编译诊断、Runtime 诊断、live values、`serialize()` 与最近一次 submit payload。顶栏可切换 catalog 例子；框架按钮是跨端口链接（带 `?example=`），需要两个 playground 都在跑才能跳转。共享例子与编译管线在 `examples/shared`。

公开入口：`@form/core`、`@form/core/runtime`、`@form/core/extension`，以及五个叶子 package 的根入口。未声明 deep import 会被拒绝。浏览器/Worker 宿主测试依赖根目录 dev-only `playwright`，不会进入六个发布 package。架构第 20 节列出的八项能力（完整 JSON Schema 自动 UI、运行时改 Model、async rule / 内置远程 DataSource、万能 hooks、独立 nested store、DevTools mutable graph、compiler/runtime 拆包、一次性全 UI Adapter）保持 deferred / optional-unsupported，不作为 v1 产品 API。

## Definition 与编译

`defineForm()` 只做 authoring，不编译、不创建 Runtime、也不注册全局状态。`compileForm(definition)` 使用默认 Core Environment；需要业务 Plugin 时，从 `@form/core/extension` 显式构建同一个冻结 `FormEnvironment` 并传入 `compileForm(definition, { environment })`。编译不修改输入，也不访问 global registry。

静态 `ModelPath` 使用 `products[].name`、转义 property 的 JSON-string bracket，以及 tuple 的 `[#n]`；`products[0]` 属于 Runtime `InstancePath`，不会出现在 Compiled DataModel。Field Registry 与 ViewTree 分离：检查 Field 用 `model.ui.fields`，检查呈现结构用已解析的 `model.ui.viewTree`。来自 Object property edge 的 Field 带有只读 `requirement` presentation source（`required` / `optional` / `conditional`）；`required` 不是 `FieldUI` 成员。实例级 effective `required` 由 Runtime 在 activation 之后组合进 Field/View snapshot：`required = active && (static required || (conditional && activationSource.active))`。`visible` / `disabled` / `readonly`、Widget props、`native` 与 Validation error 都不参与该组合。Renderer/FieldChrome 只读该 snapshot，不读取 Schema 或 DataModel edge。

自定义逻辑 Widget 使用 `@form/core/extension` 的 `defineWidget()`：它只保留 identity 与 literal inference，不安装 Registry。`WidgetDefinition.interaction` 以纯数据声明 `setValue` / `touch` / `focus` / `blur`；Renderer 通过 Core 公开 command `setValue()` / `touch()` / `focus()` / `blur()` 实现这些动作。`RenderScope` / `InstanceBinding` / `getRenderScope()` 与 effective `required` snapshot 已由 Core Runtime 提供。

Plugin 可通过冻结 Registry 贡献三类 Schema/实例化 provider，类型只从 `@form/core/extension` 导出：`SchemaDialectDefinition` 为 `{ name, dialects, convert() }`，`SchemaExtensionDefinition` 为 `{ name, keyword: x-*, split() }`，`ValueInitializerDefinition` 为 `{ name, initialize() }`。它们都是纯同步、只读输入，不得接收 FormInstance/Store/Transaction，也不得返回 Promise。Environment build 校验 key 与 `name` 一致，并保证 `$schema` URI 与 `x-*` keyword 在整个 Environment 内唯一；冲突、空 URI 集合或非 `x-` 前缀以 `source: "plugin"` 阻断，不发布 partial Registry。Core 不内置 draft-07/draft-04 adapter，也不内置任何 `x-*` 词汇，具体转换与拆分由 Plugin 作者注册。

非 Draft 2020-12 的根 `$schema` 只在 dialect detection 阶段查 `schemaDialects`：命中则对只读输入调用一次 `convert()`，校验 JSON、深冻结并要求输出为 canonical 2020-12 后再走既有 meta-validation；未命中保持 `schema.invalid-dialect`。adapter throw / thenable / 非 JSON / 仍非 canonical 以 `source: "schema"` 的阻断 `CompileError` 失败并附 `pluginId`，不泄漏原始异常、不发布 partial model。子 Schema 内嵌的其他 dialect `$schema` 产生 unsupported diagnostic，不会静默按 2020-12 解释。

已声明的 `x-*` 在 normalization 之后、进入 UI/Rule/Config compiler 之前按 `(SchemaPath, ModelPath)` 调用 `split()`。片段合并规则是显式 authoring 优先：`fieldUI` 与 `config` 按 key 合并、`rules` 追加；重叠键产生 warning 并忽略片段值，Rule ID 冲突仍由既有 Rule compiler 诊断。canonical graph 会移除已声明 keyword。未声明的 `x-*` 仍只 warning。无法映射到 `ModelPath` 的位置（如 `if` 谓词、未被引用的 `$defs`）产生 unsupported diagnostic 且不应用片段。

`FormDefinition.rules` 使用 JSON-compatible 的 `RuleExpression` AST（scalar / `{ const }` / `{ field }` / `{ call, args }` / 固定 operator），分为 State、Computed、Validation、Effect 四类。named function 只通过 `@form/core/extension` 的 `defineRuleFunction()` 注册到 Environment，Compiled Model 只保存 function key。数组 Rule 按同一 item 的相对 `ModelPath` 绑定，不接受无法唯一确定的 sibling/descendant collection。`oneOf`/`anyOf`/`if`/`dependentSchemas` 编译为有限 activation plan；无法保真的 predicate 在编译期阻断。

effective `active` 由 ancestor、Schema activation 与 active Rule 以 AND 组成（root 恒为 active）；`visible` 再 AND UI/Rule visible，因此 hidden 仍可保持 active。`disabled`/`readonly` 以 OR 组成，Computed target 强制 readonly。`serialize()` 默认按 Compiled `serializeInactive`（缺省 false）做 active-only prune，显式 `{ includeInactive }` 或 named Serializer key 可覆盖；serialize 不看 visible/disabled/readonly。Validation Rule 编译为 `custom` source 的 plan，由 Runtime 在 Rule/effect 稳定后执行。

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

`FormConfig.valueInitializer` 与 `FormConfig.serializer` 一样只声明已注册的 string key；Compiler 校验 key 存在后写入 Compiled Model，不执行 provider。`createForm()` / `engine.create()` 的 `valueInitializer` option 可覆盖本次实例的默认 key（option > Compiled default > none），覆盖不修改 Definition 或 Compiled Model。命中后 Runtime 在 array identity materialization 与 Computed/Effect/activation 稳定之前同步运行一次 `initialize()`，结果经 JSON 校验后成为 Runtime-owned initial snapshot：`version` 为 0，dirty 基线与之后的 `reset()` 都恢复该结果，不再次执行 initializer。throw / thenable / 非 JSON / 未注册 key 以 `source: "runtime"` 阻断创建，不建立 store、不回退原始 values、不泄漏原始异常。

公开 snapshot 只读。`setValues(nextValues)` 是一次原子的 root replacement，不是隐式 deep-merge。写入必须经过 command/transaction；effective no-op 不增加 `version`。四个 semantic command 是 `setValue` / `touch` / `focus` / `blur`：`touch()` 以 Field `InstancePath` 为目标，`focus()` / `blur()` / `setCollapsed()` / `setActiveTab()` 以具体 `ViewNodeId` 为目标。`blur()` 只清除该 View 的 focused，不隐式 touch，也不修改 values；Runtime 会把 focus-to-blur 记录进 change set，供 Validation 的 `blur` trigger 使用。View source state 还包括 `collapsed`（默认 `false`）与 `activeTab`（默认 `undefined`）；`reset()` 将它们恢复默认值，数组 item 删除时随 subtree 清理。Core 不解释 tab key 是否存在于 layout，也不实现 Renderer 的 DOM focus 策略。

`FormInstance.array(path)` 与 `scope(path)` 返回共享同一 Runtime 的轻量 facade。数组 index 只是当前地址，`ArrayItemId` 才是 item 身份：`move` 后 Field/View source state 跟随 ID，`remove`/`replaceItem`/`reset` 以及默认 whole-array `setValue` 会作废旧 ID 与 scope。`setItemValue` 保留根 item ID；未配置 Identity Resolver 时，有效的整个数组替换会重建全部 item ID，而不会按 index 或业务字段猜测复用。可在 `createForm` 选项中按数组 `ModelPath` 提供纯同步 `ArrayIdentityResolver`（从 `@form/core/runtime` 导入类型）做 key reconcile；重复 key 或抛错会使 transaction 回滚。固定 tuple 现存 slot 可 `setItemValue`/`replaceItem`，但不支持 append/insert/remove/move/clear。

`createForm()` 在返回实例前会无 publish 地稳定 Computed/Effect/activation，`version` 仍为 0，稳定后的 values 作为 dirty baseline。`FormInstance.serialize(options?)` 读取已提交 snapshot；默认 active-only。Validation 由 `validate()` / `applyErrors()` / `submit()` 交付；Core 不提供异步规则执行器，也不渲染 UI。

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

## Validation

Core 只通过 Registry key 引用 validator，不嵌入 AJV instance、callback 或 Runtime binding。`defineValidator()` 是 Extension identity helper，必须注册进冻结 `FormEnvironment` 后才能被 `compileForm()` 解析。`validateOn` 控制 automatic 执行（默认 `submit`），`errorPresentation` 只影响是否展示（默认 `touched-or-submitted`），两者互不改写。`validate()` 执行完整 effective validation 并等待本次 async latest-wins；`applyErrors()` 原子注入 server errors；`submit(handler)` 先完整校验，invalid 时不调用 handler，valid 时用同一 snapshot 的 `serialize()` 结果调用业务 handler，Core 不发起网络请求。Renderer 只读 snapshot，不得写入 errors。

```ts
import { compileForm, createForm, defineForm } from "@form/core";
import {
  createFormEnvironment,
  definePlugin,
  defineValidator,
} from "@form/core/extension";
import { AJV_VALIDATOR_KEY, createAjvValidator } from "@form/validator-ajv";

const environment = createFormEnvironment({
  plugins: [
    definePlugin({
      id: "company",
      dependsOn: ["core"],
      contributes: {
        validators: {
          [AJV_VALIDATOR_KEY]: createAjvValidator(),
          "company.unique-email": defineValidator({
            name: "company.unique-email",
            kind: "async",
            validate: async () => [],
          }),
        },
      },
    }),
  ],
});

const { model } = compileForm(
  defineForm({
    schema: {
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    },
    config: {
      schemaValidator: AJV_VALIDATOR_KEY,
      validateOn: "submit",
      errorPresentation: "touched-or-submitted",
      validators: [{ validator: "company.unique-email", target: "email", dependencies: [] }],
    },
  }),
  { environment },
);

const validated = createForm(model, { environment, initialValues: { email: "a@b.c" } });
validated.applyErrors([{ code: "remote", instancePath: "email" }]);
await validated.validate();
await validated.submit(async (payload) => {
  void payload;
});
```
