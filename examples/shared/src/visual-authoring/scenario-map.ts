export interface VisualScenarioFixture {
  readonly scenario: string;
  readonly testIds: readonly string[];
  readonly fixtures: readonly string[];
}

/**
 * visual-schema-editor 每个 Scenario 的稳定 test ID 与 fixture 清单。
 * fixtures 名称对应 `./fixtures.ts` 中的 supported/unsupported 条目。
 */
export const VISUAL_SCHEMA_EDITOR_SCENARIO_MAP: readonly VisualScenarioFixture[] = Object.freeze([
  Object.freeze({
    scenario: "打开可视化编辑模式",
    testIds: Object.freeze(["VSE-OPEN-THREE-COLUMN"]),
    fixtures: Object.freeze(["supported.root-scalar-fields"]),
  }),
  Object.freeze({
    scenario: "选择画布节点进行配置",
    testIds: Object.freeze(["VSE-SELECT-NODE-INSPECTOR"]),
    fixtures: Object.freeze(["supported.root-scalar-fields"]),
  }),
  Object.freeze({
    scenario: "添加常用字段",
    testIds: Object.freeze(["VSE-ADD-SCALAR-FIELDS"]),
    fixtures: Object.freeze(["supported.empty-root", "supported.root-scalar-fields"]),
  }),
  Object.freeze({
    scenario: "添加 presentation layout",
    testIds: Object.freeze(["VSE-ADD-LAYOUT"]),
    fixtures: Object.freeze(["supported.group-and-layouts"]),
  }),
  Object.freeze({
    scenario: "将字段拖入 grid 并重排",
    testIds: Object.freeze(["VSE-DRAG-INTO-GRID"]),
    fixtures: Object.freeze(["supported.group-and-layouts"]),
  }),
  Object.freeze({
    scenario: "拒绝非法嵌套",
    testIds: Object.freeze(["VSE-REJECT-ILLEGAL-NEST"]),
    fixtures: Object.freeze(["supported.illegal-move-source"]),
  }),
  Object.freeze({
    scenario: "键盘完成等价重排",
    testIds: Object.freeze(["VSE-KEYBOARD-MOVE"]),
    fixtures: Object.freeze(["supported.group-and-layouts"]),
  }),
  Object.freeze({
    scenario: "配置 required select 字段",
    testIds: Object.freeze(["VSE-REQUIRED-SELECT"]),
    fixtures: Object.freeze(["supported.required-select"]),
  }),
  Object.freeze({
    scenario: "重复 key 不产生部分更新",
    testIds: Object.freeze(["VSE-DUPLICATE-KEY"]),
    fixtures: Object.freeze(["supported.duplicate-key-source"]),
  }),
  Object.freeze({
    scenario: "required 与 visible 保持不同语义",
    testIds: Object.freeze(["VSE-REQUIRED-VS-VISIBLE"]),
    fixtures: Object.freeze(["supported.required-and-visible"]),
  }),
  Object.freeze({
    scenario: "可视化修改同步到文本工作台",
    testIds: Object.freeze(["VSE-SYNC-TO-TEXT"]),
    fixtures: Object.freeze(["supported.root-scalar-fields"]),
  }),
  Object.freeze({
    scenario: "重复生成结果稳定",
    testIds: Object.freeze(["VSE-DETERMINISTIC-EXPORT"]),
    fixtures: Object.freeze(["supported.root-scalar-fields", "supported.group-and-layouts"]),
  }),
  Object.freeze({
    scenario: "导入受支持的文本定义",
    testIds: Object.freeze(["VSE-IMPORT-SUPPORTED"]),
    fixtures: Object.freeze(["supported.root-scalar-fields", "supported.no-explicit-layout"]),
  }),
  Object.freeze({
    scenario: "不支持内容阻止可视化写入",
    testIds: Object.freeze(["VSE-IMPORT-UNSUPPORTED"]),
    fixtures: Object.freeze([
      "unsupported.syntax-error",
      "unsupported.unknown-keyword",
      "unsupported.nested-object",
      "unsupported.nested-array",
      "unsupported.conditional",
      "unsupported.ref",
      "unsupported.custom-widget",
      "unsupported.custom-layout",
      "unsupported.remaining-fields",
      "unsupported.duplicate-field-view",
    ]),
  }),
  Object.freeze({
    scenario: "明确确认后新建文档",
    testIds: Object.freeze(["VSE-CONFIRM-NEW-DOCUMENT"]),
    fixtures: Object.freeze(["unsupported.unknown-keyword"]),
  }),
  Object.freeze({
    scenario: "成功变更刷新全部预览",
    testIds: Object.freeze(["VSE-PREVIEW-BROADCAST"]),
    fixtures: Object.freeze(["supported.root-scalar-fields"]),
  }),
  Object.freeze({
    scenario: "编译失败保留最近成功预览",
    testIds: Object.freeze(["VSE-COMPILE-PRESERVE"]),
    fixtures: Object.freeze(["supported.root-scalar-fields"]),
  }),
  Object.freeze({
    scenario: "复制和下载完整定义",
    testIds: Object.freeze(["VSE-EXPORT-COPY-DOWNLOAD"]),
    fixtures: Object.freeze(["supported.root-scalar-fields"]),
  }),
  Object.freeze({
    scenario: "错误状态阻止陈旧导出",
    testIds: Object.freeze(["VSE-EXPORT-STALE-BLOCK"]),
    fixtures: Object.freeze(["supported.duplicate-key-source"]),
  }),
  Object.freeze({
    scenario: "删除选中节点后恢复焦点",
    testIds: Object.freeze(["VSE-FOCUS-AFTER-DELETE"]),
    fixtures: Object.freeze(["supported.root-scalar-fields"]),
  }),
  Object.freeze({
    scenario: "属性错误可被辅助技术定位",
    testIds: Object.freeze(["VSE-A11Y-FIELD-ERROR"]),
    fixtures: Object.freeze(["supported.duplicate-key-source"]),
  }),
]);

export const PACKAGE_ARCHITECTURE_VISUAL_SCENARIO_MAP: readonly VisualScenarioFixture[] = Object.freeze([
  Object.freeze({
    scenario: "Playground typecheck 允许 chrome 宿主依赖但不污染产品包",
    testIds: Object.freeze(["VSE-BOUNDARY-CHROME"]),
    fixtures: Object.freeze([]),
  }),
  Object.freeze({
    scenario: "预览 iframe 不加载编辑器 Tailwind",
    testIds: Object.freeze(["VSE-IFRAME-STYLE-ISOLATION"]),
    fixtures: Object.freeze([]),
  }),
  Object.freeze({
    scenario: "Monaco 编辑五个 workbench 文档且协议保持",
    testIds: Object.freeze(["VSE-PROTOCOL-UNCHANGED"]),
    fixtures: Object.freeze(["supported.root-scalar-fields"]),
  }),
  Object.freeze({
    scenario: "shared 转换可在无 DOM 环境测试",
    testIds: Object.freeze(["VSE-NODE-PURE-CONVERT"]),
    fixtures: Object.freeze(["supported.root-scalar-fields", "unsupported.unknown-keyword"]),
  }),
]);
