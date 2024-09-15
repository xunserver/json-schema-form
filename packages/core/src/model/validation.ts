import type { JsonSchema } from "../definition/json-schema.js";
import type { ErrorPresentationPolicy, ValidationTrigger } from "../definition/form-config.js";
import type { JsonValue } from "../definition/json-value.js";
import type { ModelPath } from "../path/index.js";
import type { ReadonlyKeyedCollection } from "./readonly-collection.js";

export interface SchemaValidationPlan {
  readonly id: "schema";
  readonly schema: JsonSchema;
  readonly adapterKey?: string;
  readonly unbound: boolean;
  readonly pluginId?: string;
}

export interface NamedValidationPlan {
  readonly id: string;
  readonly key: string;
  readonly kind: "sync" | "async";
  readonly target: ModelPath;
  readonly dependencies: readonly ModelPath[];
  readonly triggers: readonly ValidationTrigger[];
  readonly options?: JsonValue;
  readonly pluginId?: string;
}

export interface ValidationRulePlan {
  readonly id: string;
  readonly ruleId: string;
  readonly target: ModelPath;
  readonly dependencies: readonly ModelPath[];
  readonly code: string;
  readonly message: string;
  readonly params?: JsonValue;
}

export interface ServerValidationPlan {
  readonly preserveOnChange: boolean;
}

export interface PresentationPlan {
  readonly policy: ErrorPresentationPolicy;
}

export interface ValidationModel {
  readonly schema: SchemaValidationPlan;
  readonly custom: readonly NamedValidationPlan[];
  readonly async: readonly NamedValidationPlan[];
  readonly rules: readonly ValidationRulePlan[];
  readonly server: ServerValidationPlan;
  readonly presentation: PresentationPlan;
  readonly validateOn: ValidationTrigger;
  readonly byTarget: ReadonlyKeyedCollection<ModelPath, readonly string[]>;
  readonly byDependency: ReadonlyKeyedCollection<ModelPath, readonly string[]>;
}
