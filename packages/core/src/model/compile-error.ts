import type { Diagnostic } from "../diagnostic/index.js";
import { freezeDiagnostics } from "../diagnostic/freeze.js";

export class CompileError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(
    diagnostics: readonly Diagnostic[],
    message = "Form compilation failed",
  ) {
    super(message);
    this.name = "CompileError";
    this.diagnostics = freezeDiagnostics(diagnostics);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
