# 编译

`compileForm(definition)` 把只读输入编译为不可变 `CompiledFormModel`。默认使用 Core Environment；需要业务 Plugin 时，从 `@xunserver-jsf/core/extension` 显式构建同一个冻结 `FormEnvironment` 并传入 `compileForm(definition, { environment })`。

编译不修改输入，也不访问 global registry。`CompiledFormModel` 是模板，实例 values 只存在于 `FormInstance`。

```ts
import { compileForm, CompileError, defineForm } from "@xunserver-jsf/core";

const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
    },
  },
});

const { model, diagnostics } = compileForm(definition);
void model.data.nodes.get("title");
void model.ui.fields.get("title")?.widget;
void model.ui.fields.get("title")?.requirement;
void model.ui.viewTree;
void diagnostics;
```

## Compiled Model 包含什么

- DataModel
- UIModel（Field Registry + 已解析 ViewTree）
- RuleModel
- ValidationModel
- SchemaDynamics
- Diagnostics

## Dialect 与 `x-*`

非 Draft 2020-12 的根 `$schema` 只在 dialect detection 阶段查已注册的 `schemaDialects`：命中则对只读输入调用一次 `convert()`，输出必须是 canonical 2020-12。未命中保持 `schema.invalid-dialect`。Core 不内置 draft-07 / draft-04 adapter。

已声明的 `x-*` 在 normalization 之后、进入 UI/Rule/Config compiler 之前按 `(SchemaPath, ModelPath)` 调用 `split()`。片段合并规则是显式 authoring 优先：重叠键产生 warning 并忽略片段值。未声明的 `x-*` 仍只 warning。

## 失败语义

`CompileError` 携带 diagnostics。adapter throw / thenable / 非 JSON / 仍非 canonical 以阻断错误失败，不泄漏原始异常，不发布 partial model。子 Schema 内嵌的其他 dialect `$schema` 产生 unsupported diagnostic，不会静默按 2020-12 解释。
