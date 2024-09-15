import type { ModelPath } from "../path/index.js";

export interface CompiledValidator {
  readonly id: string;
  readonly target: ModelPath;
}

export interface ValidationModel {
  readonly validators: readonly CompiledValidator[];
}
