# Playground

Playground 用来对照同一份 Form Definition 在多套 Adapter 上的渲染。它是非发布 example，不是产品 package。

- 在线：[Playground](/playground/)
- 文档：[文档首页](/)
- 仓库：https://github.com/xunserver/json-schema-form

## 本地

```bash
pnpm playground
```

打开 http://127.0.0.1:5173/ 。顶栏可在 **文本** 与 **可视化** 模式间切换。文本模式用 Monaco 编辑 `schema` / `uiSchema` / `rules` / `config` / `formData`；可视化模式用组件面板、设计画布和属性检查器生成 Schema 与 UI Schema。右侧 iframe 对照 Element Plus / Ant Design / shadcn。需要专注编辑时，可在顶栏点 **隐藏预览** 收起右侧预览与检查器，编辑区会占满剩余宽度；点 **显示预览** 即可恢复，预览帧会保持挂载。

两种模式共享同一份 `WorkbenchDocument`。可视化提交只改写 schema/uiSchema 文本，并走既有编译、诊断与 `form-playground-v1` 广播；rules、config、formData 保持原样。

## 可视化支持矩阵

首版只编辑 **root object + scalar 字段 + presentation layout** 子集：

| 组件 | JSON Schema | UI Schema |
|---|---|---|
| 文本 / 长文本 | `string` | `text` / `textarea` |
| 数字 | `number` 或 `integer` | `number` |
| 布尔 | `boolean` | `checkbox` / `switch` |
| 单选 | `string` + 非空 `enum` | `select` |
| 分组 / 纵向 / 横向 / 网格 | 不改变数据层级 | `group` 或 `layout` + `columns`/`span` |

`required` 只写入 root object 的 JSON Schema `required`，不会进入 `FieldUI`。字段 key 必须能形成 canonical `ModelPath`（标识符）。

**明确非目标：** playground 可视化编辑器不承诺任意 JSON Schema 的无损双向编辑，也不覆盖 nested Object/Array、conditional、`$ref`、组合关键字、自定义 Widget/layout、Rules、Form Config、协作或持久化。

## 不支持的文本与覆盖确认

从文本模式或 catalog 进入可视化时，系统会做严格导入。`simple` 这类受支持示例会恢复等价字段顺序与配置。`kitchen-sink`、`conditional`、`computed-array` 等包含数组、自定义 Widget 或条件关键字的示例会显示定位诊断，并 **保持五份原始文本不变**。

只有在选择「新建可视化文档」并二次确认后，才会用空的受支持 root object 替换 schema/uiSchema；rules、config、formData 仍保留。

## 导出

可视化顶栏可复制或下载 UTF-8 格式化 JSON：

- Draft 2020-12 Schema（`schema.json`）
- UI Schema（`ui-schema.json`）
- 完整 Form Definition（`form-definition.json`，含当前 schema / uiSchema / rules / config）

`formData`、Runtime live values 与 `EditorNodeId` 不会进入导出。存在未提交属性错误、导入阻断或编译失败时，导出按钮禁用并说明原因。

## 键盘操作

指针拖拽与键盘路径产生同一套 `AddNode` / `MoveNode` 命令：

- 组件面板的「添加」把节点放入当前容器或根对象
- 「键盘移动」后用「放到这里」选择合法目标
- 画布节点可聚焦、选中和删除；删除后焦点移到相邻节点、父容器或空画布入口
- 属性检查器的错误有文字说明，并与对应控件 `aria-describedby` 关联，不只依赖颜色

## Catalog

共享 catalog 在 `examples/shared/catalog/`：

| id | 演示 |
|---|---|
| `simple` | 默认 ViewTree + label，可用可视化导入 |
| `all-fields` | 九类 widget |
| `kitchen-sink` | layout、数组、可见性、自定义货币 |
| `validation` | required / minLength / change + 错误展示 |
| `conditional` | if/then + 可见性 |
| `computed-array` | 数组 + 计算字段 |

工作台 chrome 的 shadcn 组件不是表单 Widget 源；产品 `@xunserver-jsf/shadcn` 由独立预览帧挂载。拖拽库只存在 playground 父页面，不会进入预览 iframe。

## GitHub Pages

线上地址与当前文档站点同源，路径为 `/playground/`。从文档站点击该链接会整页进入演练场，而不是走 VitePress 客户端路由。

`pnpm docs:dev` 只预览文档。完整静态站点：`pnpm site:build`，产物在 `docs/.vitepress/dist`。
