export const SCHEMA_DIAGNOSTIC_CODES = Object.freeze({
  INVALID_DIALECT: "schema.invalid-dialect",
  INVALID_KEYWORD: "schema.invalid-keyword",
  UNRESOLVED_REF: "schema.unresolved-ref",
  SHAPE_INFERRED: "schema.shape-inferred",
  GENERATION_UNSUPPORTED: "schema.generation-unsupported",
  UNSUPPORTED_EXTENSION: "schema.unsupported-extension",
});

export const COMPILER_DIAGNOSTIC_CODES = Object.freeze({
  INVALID_DEFINITION: "compiler.invalid-definition",
  UI_PATH_MISSING: "compiler.ui-path-missing",
  NATIVE_RESERVED_KEY: "compiler.native-reserved-key",
  NATIVE_INVALID: "compiler.native-invalid",
  WIDGET_MISSING: "compiler.widget-missing",
  WIDGET_INCOMPATIBLE: "compiler.widget-incompatible",
  WIDGET_AMBIGUOUS: "compiler.widget-ambiguous",
  LAYOUT_INVALID: "compiler.layout-invalid",
  FIELD_WIDGET_CONFLICT: "compiler.field-widget-conflict",
});

export type SchemaDiagnosticCode =
  (typeof SCHEMA_DIAGNOSTIC_CODES)[keyof typeof SCHEMA_DIAGNOSTIC_CODES];

export type CompilerDiagnosticCode =
  (typeof COMPILER_DIAGNOSTIC_CODES)[keyof typeof COMPILER_DIAGNOSTIC_CODES];

export type CompileDiagnosticCode = SchemaDiagnosticCode | CompilerDiagnosticCode;

export const DIAGNOSTIC_CODE_RANK: Readonly<Record<CompileDiagnosticCode, number>> = Object.freeze({
  [SCHEMA_DIAGNOSTIC_CODES.INVALID_DIALECT]: 0,
  [SCHEMA_DIAGNOSTIC_CODES.INVALID_KEYWORD]: 1,
  [SCHEMA_DIAGNOSTIC_CODES.UNRESOLVED_REF]: 2,
  [SCHEMA_DIAGNOSTIC_CODES.UNSUPPORTED_EXTENSION]: 3,
  [SCHEMA_DIAGNOSTIC_CODES.GENERATION_UNSUPPORTED]: 4,
  [SCHEMA_DIAGNOSTIC_CODES.SHAPE_INFERRED]: 5,
  [COMPILER_DIAGNOSTIC_CODES.INVALID_DEFINITION]: 0,
  [COMPILER_DIAGNOSTIC_CODES.UI_PATH_MISSING]: 1,
  [COMPILER_DIAGNOSTIC_CODES.FIELD_WIDGET_CONFLICT]: 2,
  [COMPILER_DIAGNOSTIC_CODES.NATIVE_RESERVED_KEY]: 3,
  [COMPILER_DIAGNOSTIC_CODES.NATIVE_INVALID]: 4,
  [COMPILER_DIAGNOSTIC_CODES.WIDGET_MISSING]: 5,
  [COMPILER_DIAGNOSTIC_CODES.WIDGET_INCOMPATIBLE]: 6,
  [COMPILER_DIAGNOSTIC_CODES.WIDGET_AMBIGUOUS]: 7,
  [COMPILER_DIAGNOSTIC_CODES.LAYOUT_INVALID]: 8,
});
