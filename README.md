# JSON Schema Form

以 JSON Schema 为数据契约的表单引擎。当前仓库完成的是 pnpm/TypeScript 工作区、六个首期 package 边界，以及 `@form/core` 的框架无关公共契约：无副作用的 `defineForm()`、可诊断的冻结 `FormEnvironment`、把 Draft 2020-12 Schema / UI Schema 编译为不可变静态模型的 `compileForm()`，以及事务化的基础 `createForm()` / `createFormEngine()` Runtime。Rule、Validation、数组项身份、Renderer 和业务 Validator 仍由后续垂直切片交付。

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

静态 `ModelPath` 使用 `products[].name`、转义 property 的 JSON-string bracket，以及 tuple 的 `[#n]`；`products[0]` 属于未来 Runtime `InstancePath`，不会出现在 Compiled DataModel。Field Registry 与 ViewTree 分离：检查 Field 用 `model.ui.fields`，检查呈现结构用已解析的 `model.ui.viewTree`。当前产物只装配冻结的 Rule / Validation / SchemaDynamics 边界，不编译或执行 Rule、业务 Validation 或 Schema activation。

```ts
import { compileForm, CompileError, defineForm } from "@form/core";
import {
  createFormEnvironment,
  definePlugin,
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
void model.ui.viewTree;
void diagnostics;

const companyPlugin = definePlugin({
  id: "company",
  dependsOn: ["core"],
  contributes: {
    widgets: {
      sku: {
        name: "sku",
        valueContract: {
          jsonTypes: ["string"],
          canonical: "json-scalar",
        },
      },
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

公开 snapshot 只读。`setValues(nextValues)` 是一次原子的 root replacement，不是隐式 deep-merge。写入必须经过 command/transaction；effective no-op 不增加 `version`。当前 Runtime 可以替换整个 array value，但 `items[0]` 这类 index path 尚不能绑定，数组项身份由后续切片交付。

只读 selector / subscription / Runtime diagnostic observer 从 `@form/core/runtime` 导入，不从根入口重导出。`FormInstance` 目前提供 get/set/state/touch/focus/reset；`array()`、`scope()`、`validate()`、`submit()`、`serialize()` 以及 Rule/Validation 求值尚未实现。

```ts
import { compileForm, createForm, createFormEngine, defineForm, FormRuntimeError } from "@form/core";
import { createFormEnvironment } from "@form/core/extension";
import { formSelector, subscribeRuntime, valueSelector } from "@form/core/runtime";

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
form.reset();

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
});

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
