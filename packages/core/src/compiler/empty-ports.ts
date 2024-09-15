import type { RuleModel } from "../model/rule.js";
import type { SchemaDynamics } from "../model/schema-dynamics.js";
import type { ValidationModel } from "../model/validation.js";
import { createReadonlyKeyedCollection } from "../model/readonly-collection.js";
import { deepFreeze } from "./immutable.js";

export function emptyRuleModel(): RuleModel {
  return deepFreeze({
    rules: [],
    byPath: createReadonlyKeyedCollection([]),
    computedOrder: [],
    serialization: { serializeInactive: false },
  });
}

export function emptyValidationModel(): ValidationModel {
  return deepFreeze({
    validators: [],
  });
}

export function emptySchemaDynamics(): SchemaDynamics {
  return deepFreeze({
    activations: [],
    plans: [],
    byPath: createReadonlyKeyedCollection([]),
  });
}
