import type { EditorNodeId } from "./model.js";

export type VisualDiagnosticSeverity = "error";

export interface VisualEditorDiagnostic {
  readonly code: string;
  readonly severity: VisualDiagnosticSeverity;
  readonly message: string;
  readonly nodeId?: EditorNodeId;
  readonly property?: string;
  readonly jsonPointer?: string;
}

export const VISUAL_DIAGNOSTIC_CODES = Object.freeze({
  syntaxError: "playground.visual.syntax-error",
  unsupportedKeyword: "playground.visual.unsupported-keyword",
  nestedSchema: "playground.visual.nested-schema",
  unsupportedWidget: "playground.visual.unsupported-widget",
  unsupportedLayout: "playground.visual.unsupported-layout",
  remainingFields: "playground.visual.remaining-fields",
  duplicateFieldView: "playground.visual.duplicate-field-view",
  duplicateKey: "playground.visual.duplicate-key",
  invalidKey: "playground.visual.invalid-key",
  invalidDefault: "playground.visual.invalid-default",
  invalidEnum: "playground.visual.invalid-enum",
  invalidWidget: "playground.visual.invalid-widget",
  invalidConstraint: "playground.visual.invalid-constraint",
  invalidTarget: "playground.visual.invalid-target",
  cycle: "playground.visual.cycle",
  invalidIndex: "playground.visual.invalid-index",
  invalidColumns: "playground.visual.invalid-columns",
  invalidSpan: "playground.visual.invalid-span",
  missingNode: "playground.visual.missing-node",
  staleSession: "playground.visual.stale-session",
});

export function visualDiagnostic(
  code: string,
  message: string,
  extra: {
    readonly nodeId?: EditorNodeId;
    readonly property?: string;
    readonly jsonPointer?: string;
  } = {},
): VisualEditorDiagnostic {
  return Object.freeze({
    code,
    severity: "error",
    message,
    ...extra,
  });
}
