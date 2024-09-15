import type { Diagnostic } from "@form/core";
import { RENDERER_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { freezeAdapterDiagnostic, RendererAdapterError } from "./errors.js";

export function reportAdapterFailure(
  input: {
    readonly adapterId: string;
    readonly code?: string;
    readonly message: string;
    readonly key?: string;
    readonly viewId?: string;
    readonly modelPath?: Diagnostic["modelPath"];
    readonly cause?: unknown;
  },
  report?: (diagnostic: Diagnostic) => void,
): never {
  const diagnostic = freezeAdapterDiagnostic({
    code: input.code ?? RENDERER_DIAGNOSTIC_CODES.RENDER_FAILURE,
    severity: "error",
    message: input.message,
    source: "adapter",
    pluginId: input.adapterId,
    ...(input.modelPath === undefined ? {} : { modelPath: input.modelPath }),
    metadata: {
      adapterId: input.adapterId,
      ...(input.key === undefined ? {} : { key: input.key }),
      ...(input.viewId === undefined ? {} : { viewId: input.viewId }),
    },
  });
  report?.(diagnostic);
  throw new RendererAdapterError(diagnostic, input.cause);
}

export function wrapAdapterCall<T>(
  run: () => T,
  input: {
    readonly adapterId: string;
    readonly key?: string;
    readonly viewId?: string;
    readonly modelPath?: Diagnostic["modelPath"];
  },
  report?: (diagnostic: Diagnostic) => void,
): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof RendererAdapterError) {
      report?.(error.diagnostic);
      throw error;
    }
    return reportAdapterFailure(
      {
        adapterId: input.adapterId,
        message: error instanceof Error ? error.message : "Adapter operation failed",
        ...(input.key === undefined ? {} : { key: input.key }),
        ...(input.viewId === undefined ? {} : { viewId: input.viewId }),
        ...(input.modelPath === undefined ? {} : { modelPath: input.modelPath }),
        cause: error,
      },
      report,
    );
  }
}
