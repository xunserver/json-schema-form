import type { Diagnostic } from "./index.js";

export function freezeDiagnostic(diagnostic: Diagnostic): Diagnostic {
  const frozen: Diagnostic = {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    source: diagnostic.source,
    ...(diagnostic.schemaPath === undefined ? {} : { schemaPath: diagnostic.schemaPath }),
    ...(diagnostic.modelPath === undefined ? {} : { modelPath: diagnostic.modelPath }),
    ...(diagnostic.pluginId === undefined ? {} : { pluginId: diagnostic.pluginId }),
    ...(diagnostic.metadata === undefined
      ? {}
      : { metadata: Object.freeze({ ...diagnostic.metadata }) }),
  };

  return Object.freeze(frozen);
}

export function freezeDiagnostics(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return Object.freeze(diagnostics.map(freezeDiagnostic));
}
