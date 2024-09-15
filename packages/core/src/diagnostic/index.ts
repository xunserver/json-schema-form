import type { ModelPath, SchemaPath } from "../model/path/index.js";

export { freezeDiagnostic, freezeDiagnostics } from "./freeze.js";

export type DiagnosticSeverity = "error" | "warning" | "info";

export type DiagnosticSource =
  | "schema"
  | "compiler"
  | "plugin"
  | "adapter"
  | "runtime";

export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly source: DiagnosticSource;
  readonly schemaPath?: SchemaPath;
  readonly modelPath?: ModelPath;
  readonly pluginId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
