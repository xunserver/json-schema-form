import type { Diagnostic } from "../diagnostic/index.js";
import { freezeDiagnostics } from "../diagnostic/freeze.js";

export class FormRuntimeError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(diagnostics: readonly Diagnostic[], message = "Form runtime failed") {
    super(message);
    this.name = "FormRuntimeError";
    this.diagnostics = freezeDiagnostics(diagnostics);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
