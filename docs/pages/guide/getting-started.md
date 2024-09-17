# 快速开始

应用路径固定为：

```text
defineForm() → compileForm() → createForm() → FormRenderer
```

Core 始终需要。AJV 只能从 `@xunserver-jsf/validator-ajv` 引入，并放进 **同一个** `FormEnvironment`，再同时传给 `compileForm` 与 `createForm`。

## 安装

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

其他栈：

| 目标 | 额外安装 |
|---|---|
| React + shadcn | `@xunserver-jsf/shadcn`；组件由你注入，见 [shadcn Adapter](/react/shadcn) |

## Vue：第一个能提交的表单

```vue
<script setup lang="ts">
import { defineForm, compileForm, createForm } from "@xunserver-jsf/core";
import { createFormEnvironment, definePlugin } from "@xunserver-jsf/core/extension";
import { AJV_VALIDATOR_KEY, createAjvValidator } from "@xunserver-jsf/validator-ajv";
import { FormRenderer } from "@xunserver-jsf/vue";
import { elementPlusAdapter } from "@xunserver-jsf/element-plus";
import "element-plus/dist/index.css";

const environment = createFormEnvironment({
  plugins: [
    definePlugin({
      id: "app",
      dependsOn: ["core"],
      contributes: {
        validators: { [AJV_VALIDATOR_KEY]: createAjvValidator() },
      },
    }),
  ],
});

const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      email: { type: "string" },
    },
    required: ["name"],
  },
  uiSchema: {
    fields: {
      name: { display: { label: "姓名" } },
      email: { display: { label: "邮箱" } },
    },
  },
  config: {
    schemaValidator: AJV_VALIDATOR_KEY,
    validateOn: "submit",
    errorPresentation: "touched-or-submitted",
  },
});

const { model } = compileForm(definition, { environment });
const form = createForm(model, {
  environment,
  initialValues: { name: "Ada", email: "ada@example.com" },
});

async function onSubmit(payload: unknown) {
  console.log("serialize", payload);
}
</script>

<template>
  <FormRenderer :form="form" :adapter="elementPlusAdapter" :submit-handler="onSubmit" />
</template>
```

`FormRenderer` 的 `submitHandler` 会在表单 submit 时调用 `form.submit(handler)`：先校验，通过后把 `serialize()` 结果交给 handler。

## React：第一个能提交的表单

```tsx
import { defineForm, compileForm, createForm } from "@xunserver-jsf/core";
import { createFormEnvironment, definePlugin } from "@xunserver-jsf/core/extension";
import { AJV_VALIDATOR_KEY, createAjvValidator } from "@xunserver-jsf/validator-ajv";
import { FormRenderer } from "@xunserver-jsf/react";
import { antdAdapter } from "@xunserver-jsf/antd";
import "antd/dist/reset.css";

const environment = createFormEnvironment({
  plugins: [
    definePlugin({
      id: "app",
      dependsOn: ["core"],
      contributes: {
        validators: { [AJV_VALIDATOR_KEY]: createAjvValidator() },
      },
    }),
  ],
});

const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      email: { type: "string" },
    },
    required: ["name"],
  },
  uiSchema: {
    fields: {
      name: { display: { label: "姓名" } },
      email: { display: { label: "邮箱" } },
    },
  },
  config: {
    schemaValidator: AJV_VALIDATOR_KEY,
    validateOn: "submit",
    errorPresentation: "touched-or-submitted",
  },
});

const { model } = compileForm(definition, { environment });
const form = createForm(model, {
  environment,
  initialValues: { name: "Ada", email: "ada@example.com" },
});

export function App() {
  return (
    <FormRenderer
      form={form}
      adapter={antdAdapter}
      submitHandler={async (payload) => {
        console.log("serialize", payload);
      }}
    />
  );
}
```

## 本地仓库

```bash
pnpm install
pnpm build
pnpm playground
pnpm docs:dev
```

贡献者架构基线在仓库 `docs/architecture.md`，不随本站发布。

## 下一步

- [字段与外观](./fields.md)：换 widget、label、`native`
- [校验与错误](./validation.md)：`validateOn` 与错误展示
- [选择定制层级](/customize/)：从只写 Schema 到自建 Adapter
- [概念：生命周期](/concepts/lifecycle)：两套 Environment 为什么必须同一 identity
- [API](/api-overview)：TypeDoc 覆盖的公开入口

公开入口只有 package `exports` 声明的路径。未声明 deep import 不是公共 API。
