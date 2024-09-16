# @xunserver-jsf/shadcn

shadcn UI Adapter，位于 React Renderer 之上。组件由消费方注入，本包不捆绑具体 UI 实现。

```bash
pnpm add @xunserver-jsf/core @xunserver-jsf/react @xunserver-jsf/shadcn
pnpm add react
```

导出 `createShadcnAdapter({ components })` 与 `extendShadcnAdapter()`。`react` 是 peer dependency。

文档：https://xunserver.github.io/json-schema-form/
