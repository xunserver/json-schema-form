import type { JsonValue } from "../definition/json-value.js";
import type { ModelPath, SchemaPath } from "../path/index.js";
import type { ReadonlyKeyedCollection } from "./readonly-collection.js";

export interface SchemaActivation {
  readonly path: ModelPath;
  readonly schemaPath: SchemaPath;
}

export type ActivationKind = "oneOf" | "anyOf" | "if" | "dependentSchemas";

export type ActivationPredicate =
  | { readonly type: "true" }
  | { readonly type: "false" }
  | { readonly type: "type"; readonly path: ModelPath; readonly jsonTypes: readonly string[] }
  | { readonly type: "const"; readonly path: ModelPath; readonly value: JsonValue }
  | { readonly type: "enum"; readonly path: ModelPath; readonly values: readonly JsonValue[] }
  | { readonly type: "present"; readonly path: ModelPath; readonly property: string }
  | { readonly type: "all"; readonly of: readonly ActivationPredicate[] }
  | { readonly type: "any"; readonly of: readonly ActivationPredicate[] }
  | { readonly type: "not"; readonly of: ActivationPredicate };

export interface ActivationBranch {
  readonly id: string;
  readonly schemaPath: SchemaPath;
  readonly nodes: readonly ModelPath[];
  readonly exclusiveNodes: readonly ModelPath[];
  readonly sharedNodes: readonly ModelPath[];
  readonly predicate: ActivationPredicate;
  readonly dependencies: readonly ModelPath[];
  readonly property?: string;
}

export interface ActivationPlan {
  readonly id: string;
  readonly kind: ActivationKind;
  readonly ownerPath: ModelPath;
  readonly schemaPath: SchemaPath;
  readonly baseNodes: readonly ModelPath[];
  readonly branches: readonly ActivationBranch[];
  readonly dependencies: readonly ModelPath[];
}

export interface SchemaDynamics {
  readonly activations: readonly SchemaActivation[];
  readonly plans: readonly ActivationPlan[];
  readonly byPath: ReadonlyKeyedCollection<ModelPath, readonly string[]>;
}
