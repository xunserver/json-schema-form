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
    schema: { id: "schema", schema: true, unbound: true },
    custom: [],
    async: [],
    rules: [],
    server: { preserveOnChange: false },
    presentation: { policy: "touched-or-submitted" },
    validateOn: "submit",
    byTarget: createReadonlyKeyedCollection([]),
    byDependency: createReadonlyKeyedCollection([]),
  });
}

export function emptySchemaDynamics(): SchemaDynamics {
  return deepFreeze({
    activations: [],
    plans: [],
    byPath: createReadonlyKeyedCollection([]),
  });
}
