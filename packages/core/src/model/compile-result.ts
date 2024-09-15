import type { Diagnostic } from "../diagnostic/index.js";
import type { CompiledFormModel } from "./compiled-form-model.js";

export interface CompileResult {
  readonly model: CompiledFormModel;
  readonly diagnostics: readonly Diagnostic[];
}
