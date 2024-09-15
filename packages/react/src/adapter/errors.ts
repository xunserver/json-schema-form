import type { Diagnostic } from "@form/core";

function freezeDiagnostic(diagnostic: Diagnostic): Diagnostic {
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

const INTERNAL_CAUSES = new WeakMap<object, unknown>();

export class RendererEnvironmentBuildError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[], message = "React renderer environment build failed") {
    super(message);
    this.name = "RendererEnvironmentBuildError";
    this.diagnostics = Object.freeze(diagnostics.map(freezeDiagnostic));
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RendererCapabilityError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[], message = "React renderer capability preflight failed") {
    super(message);
    this.name = "RendererCapabilityError";
    this.diagnostics = Object.freeze(diagnostics.map(freezeDiagnostic));
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class RendererAdapterError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic, cause?: unknown) {
    super(diagnostic.message);
    this.name = "RendererAdapterError";
    this.diagnostic = freezeDiagnostic(diagnostic);
    if (cause !== undefined) {
      INTERNAL_CAUSES.set(this, cause);
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function freezeAdapterDiagnostic(diagnostic: Diagnostic): Diagnostic {
  return freezeDiagnostic(diagnostic);
}

export function peekAdapterErrorCause(error: RendererAdapterError): unknown {
  return INTERNAL_CAUSES.get(error);
}
