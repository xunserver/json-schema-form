# 快速开始

JSON Schema Form 把 JSON Schema 当作数据契约，把 UI Schema 当作呈现契约。应用路径固定为：

```text
defineForm() → compileForm() → createForm() → FormRenderer
```

当前仓库是 pnpm / TypeScript monorepo。正式 npm 包名是 `@xunserver-jsf/*`；scope 从早期逻辑名 `@form/*` 替换而来，职责边界不变。

## 安装

在已有 Vue 或 React 应用中安装对应 package。Core 始终需要；AJV 校验只通过 `@xunserver-jsf/validator-ajv` 引入。

Vue + Element Plus：

```bash
pnpm add @xunserver-jsf/core @xunserver-jsf/vue @xunserver-jsf/element-plus @xunserver-jsf/validator-ajv
pnpm add vue element-plus
```

React + Ant Design：

```bash
pnpm add @xunserver-jsf/core @xunserver-jsf/react @xunserver-jsf/antd @xunserver-jsf/validator-ajv
pnpm add react react-dom antd
```

本仓库本地开发：

```bash
pnpm install
pnpm build
pnpm playground
```

完整使用文档在本站点。贡献者架构基线留在仓库 `docs/architecture.md`，不随本站点发布。克隆本仓库后可运行 `pnpm docs:dev` 预览文档。

## 最短 Vue 示例

```ts
import { defineForm, compileForm, createForm } from "@xunserver-jsf/core";
import { FormRenderer } from "@xunserver-jsf/vue";
import { elementPlusAdapter } from "@xunserver-jsf/element-plus";

const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
    },
    required: ["name"],
  },
});

const { model } = compileForm(definition);
const form = createForm(model, { initialValues: { name: "Ada" } });
```

```vue
<FormRenderer :form="form" :adapter="elementPlusAdapter" />
```

## 最短 React 示例

```tsx
import { defineForm, compileForm, createForm } from "@xunserver-jsf/core";
import { FormRenderer } from "@xunserver-jsf/react";
import { antdAdapter } from "@xunserver-jsf/antd";

const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
    },
    required: ["name"],
  },
});

const { model } = compileForm(definition);
const form = createForm(model, { initialValues: { name: "Ada" } });

export function App() {
  return <FormRenderer form={form} adapter={antdAdapter} />;
}
```

## 下一步

- [Form Definition](./definition.md)：schema / uiSchema / rules / config
- [编译](./compile.md)：`compileForm()` 与 Compiled Model
- [Runtime](./runtime.md)：`createForm()`、command 与 serialize
- [Playground](./playground.md)：对照四套 Adapter

公开入口只有 package `exports` 声明的路径：`@xunserver-jsf/core`、`@xunserver-jsf/core/runtime`、`@xunserver-jsf/core/extension`，以及各 Renderer / Adapter 的根入口。未声明 deep import 会被拒绝。
