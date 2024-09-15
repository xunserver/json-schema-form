import type { CompileResult } from "../src/model/compile-result.js";
import type { CompiledFormModel } from "../src/model/compiled-form-model.js";
import type { DataModel } from "../src/model/data/data.js";
import type { RuleModel } from "../src/model/rule/rule.js";
import type { SchemaDynamics } from "../src/model/schema-dynamics/schema-dynamics.js";
import type { UIModel } from "../src/model/ui/ui.js";
import type { ValidationModel } from "../src/model/validation/validation.js";

declare const model: CompiledFormModel;
declare const result: CompileResult;

const data: DataModel = model.data;
const ui: UIModel = model.ui;
const rule: RuleModel = model.rule;
const validation: ValidationModel = model.validation;
const schemaDynamics: SchemaDynamics = model.schemaDynamics;
const diagnostics = model.diagnostics;
const requiredModel: CompileResult["model"] = result.model;

void data;
void ui;
void rule;
void validation;
void schemaDynamics;
void diagnostics;
void requiredModel;

type CompiledFormModelKeys = keyof CompiledFormModel;
type InstanceStateKeys =
  | "values"
  | "store"
  | "touched"
  | "transactionManager"
  | "scheduler"
  | "arrayItemState"
  | "viewInteraction";

type AssertNoInstanceState = Extract<CompiledFormModelKeys, InstanceStateKeys> extends never
  ? true
  : never;

const noInstanceState: AssertNoInstanceState = true;
void noInstanceState;

type ModelIsRequired = undefined extends CompileResult["model"] ? never : true;
const modelAlwaysPresent: ModelIsRequired = true;
void modelAlwaysPresent;

// @ts-expect-error CompiledFormModel domain views are readonly
model.data = data;

// @ts-expect-error CompiledFormModel diagnostics are a readonly array
model.diagnostics.push({
  code: "x",
  severity: "error",
  message: "no",
  source: "compiler",
});

// @ts-expect-error DataModel node collection cannot be mutated
model.data.nodes.set("name" as never, model.data.root);

// @ts-expect-error instance values are not part of CompiledFormModel
const values = model.values;
void values;
