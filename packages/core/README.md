# @xunserver-jsf/core

JSON Schema Form 的框架无关 Core：`defineForm()`、`compileForm()`、`createForm()` / `createFormEngine()`、事务 Runtime 与 Validation。

```bash
pnpm add @xunserver-jsf/core
```

公共入口：

- `@xunserver-jsf/core` — Application API
- `@xunserver-jsf/core/runtime` — 只读 selector / subscription / RenderScope
- `@xunserver-jsf/core/extension` — Plugin / Environment / Widget / Validator

文档：https://xunserver.github.io/json-schema-form/

后续版本由 GitHub Actions `release.yml` 通过 npm Trusted Publishing 发布。
