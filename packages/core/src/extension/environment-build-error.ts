import type { Diagnostic } from "../diagnostic/index.js";
import { freezeDiagnostic } from "../diagnostic/freeze.js";

export { freezeDiagnostic } from "../diagnostic/freeze.js";

export class EnvironmentBuildError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(
    diagnostics: readonly Diagnostic[],
    message = "Form environment build failed",
  ) {
    super(message);
    this.name = "EnvironmentBuildError";
    this.diagnostics = Object.freeze(diagnostics.map(freezeDiagnostic));
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
