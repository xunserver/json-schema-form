import type { Diagnostic } from "../diagnostic/index.js";
import type { DataModel } from "./data.js";
import type { RuleModel } from "./rule.js";
import type { SchemaDynamics } from "./schema-dynamics.js";
import type { UIModel } from "./ui.js";
import type { ValidationModel } from "./validation.js";

export interface CompiledFormModel {
  readonly data: DataModel;
  readonly ui: UIModel;
  readonly rule: RuleModel;
  readonly validation: ValidationModel;
  readonly schemaDynamics: SchemaDynamics;
  readonly diagnostics: readonly Diagnostic[];
}
