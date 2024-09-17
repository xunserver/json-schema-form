export type { VisualEditorDiagnostic } from "./diagnostics.js";
export { VISUAL_DIAGNOSTIC_CODES, visualDiagnostic } from "./diagnostics.js";
export type {
  EditorNodeId,
  FieldPalette,
  LayoutVariant,
  PaletteKind,
  VisualContainerNode,
  VisualDocument,
  VisualFieldConstraints,
  VisualFieldNode,
  VisualGroupNode,
  VisualIdAllocator,
  VisualLayoutNode,
  VisualNode,
  VisualRootNode,
  VisualSchemaType,
  VisualWidget,
} from "./model.js";
export {
  PALETTE_ITEMS,
  ROOT_EDITOR_NODE_ID,
  asEditorNodeId,
  cloneVisualDocument,
  collectFieldKeys,
  collectFieldNodes,
  createEmptyVisualDocument,
  createPaletteNode,
  createVisualIdAllocator,
  findNode,
  findParent,
  freezeVisualDocument,
  isContainerNode,
  isDescendant,
  isModelPathSafeKey,
  nextUniqueKey,
  parentLayoutColumns,
  suggestedSelectionAfterRemove,
  walkNodes,
} from "./model.js";
export type {
  AddNodeCommand,
  MoveNodeCommand,
  RemoveNodeCommand,
  UpdateFieldCommand,
  UpdateLayoutCommand,
  VisualCommand,
  VisualReduceResult,
} from "./commands.js";
export { dragResultToCommand, listValidMoveTargets, reduceVisualDocument } from "./commands.js";
export type { VisualImportResult } from "./import.js";
export {
  commitVisualIfFresh,
  emptySupportedDefinitionTexts,
  importVisualDocument,
  visualSourceKey,
} from "./import.js";
export type { WorkbenchExportSnapshot } from "./export.js";
export {
  buildSchema,
  buildUiSchema,
  exportVisualDefinitionTexts,
  exportVisualSchemaText,
  exportVisualUiSchemaText,
  exportWorkbenchSnapshots,
} from "./export.js";
export {
  PACKAGE_ARCHITECTURE_VISUAL_SCENARIO_MAP,
  VISUAL_SCHEMA_EDITOR_SCENARIO_MAP,
  type VisualScenarioFixture,
} from "./scenario-map.js";
export { getFixture, SUPPORTED_FIXTURES, UNSUPPORTED_FIXTURES, type NamedFixture } from "./fixtures.js";
