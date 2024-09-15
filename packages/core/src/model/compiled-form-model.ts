import type { Diagnostic } from "../diagnostic/index.js";
import type { DataModel } from "./data/data.js";
import type { RuleModel } from "./rule/rule.js";
import type { SchemaDynamics } from "./schema-dynamics/schema-dynamics.js";
import type { UIModel } from "./ui/ui.js";
import type { ValidationModel } from "./validation/validation.js";

export interface CompiledFormModel {
  readonly data: DataModel;
  readonly ui: UIModel;
  readonly rule: RuleModel;
  readonly validation: ValidationModel;
  readonly schemaDynamics: SchemaDynamics;
  readonly diagnostics: readonly Diagnostic[];
}
