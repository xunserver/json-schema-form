import type { Diagnostic, DiagnosticSeverity } from "../diagnostic/index.js";
import { freezeDiagnostic, freezeDiagnostics } from "../diagnostic/freeze.js";
import type { ModelPath } from "../model/path/types.js";
import {
  RUNTIME_DIAGNOSTIC_CODE_RANK,
  type RuntimeDiagnosticCode,
} from "./diagnostic-codes.js";

export function runtimeDiagnostic(input: {
  readonly code: RuntimeDiagnosticCode;
  readonly message: string;
  readonly severity?: DiagnosticSeverity;
  readonly modelPath?: ModelPath;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): Diagnostic {
  return freezeDiagnostic({
    code: input.code,
    severity: input.severity ?? "error",
    message: input.message,
    source: "runtime",
    ...(input.modelPath === undefined ? {} : { modelPath: input.modelPath }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  });
}

export function sortRuntimeDiagnostics(diagnostics: readonly Diagnostic[]): readonly Diagnostic[] {
  return freezeDiagnostics(
    diagnostics.slice().sort((left, right) => {
      const leftRank = RUNTIME_DIAGNOSTIC_CODE_RANK[left.code as RuntimeDiagnosticCode] ?? 50;
      const rightRank = RUNTIME_DIAGNOSTIC_CODE_RANK[right.code as RuntimeDiagnosticCode] ?? 50;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      if (left.code !== right.code) {
        return left.code < right.code ? -1 : 1;
      }
      if (left.message !== right.message) {
        return left.message < right.message ? -1 : 1;
      }
      const leftPath = String(left.metadata?.path ?? left.modelPath ?? "");
      const rightPath = String(right.metadata?.path ?? right.modelPath ?? "");
      if (leftPath !== rightPath) {
        return leftPath < rightPath ? -1 : 1;
      }
      return 0;
    }),
  );
}
