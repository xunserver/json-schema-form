import type { JsonPrimitive, JsonValue } from "../../definition/json-value.js";
import type { RuleKind, StateRuleAspect } from "../../definition/rule-definition.js";
import type { ModelPath } from "../path/index.js";
import type { ReadonlyKeyedCollection } from "../readonly-collection.js";

export type NormalizedRuleExpression =
  | { readonly kind: "literal"; readonly value: JsonPrimitive }
  | { readonly kind: "const"; readonly value: JsonValue }
  | { readonly kind: "field"; readonly path: ModelPath }
  | { readonly kind: "call"; readonly name: string; readonly args: readonly NormalizedRuleExpression[] }
  | {
      readonly kind: "eq" | "ne" | "lt" | "lte" | "gt" | "gte" | "in";
      readonly left: NormalizedRuleExpression;
      readonly right: NormalizedRuleExpression;
    }
  | { readonly kind: "all" | "any"; readonly items: readonly NormalizedRuleExpression[] }
  | { readonly kind: "not"; readonly operand: NormalizedRuleExpression };

export interface CompiledStateAction {
  readonly kind: "state";
  readonly aspects: Readonly<Partial<Record<StateRuleAspect, NormalizedRuleExpression>>>;
}

export interface CompiledComputedAction {
  readonly kind: "computed";
  readonly value: NormalizedRuleExpression;
}

export interface CompiledValidationFailure {
  readonly code: string;
  readonly message: string;
  readonly params?: JsonValue;
}

export interface CompiledValidationAction {
  readonly kind: "validation";
  readonly assertion: NormalizedRuleExpression;
  readonly failure: CompiledValidationFailure;
}

export interface CompiledEffectSetValue {
  readonly type: "setValue";
  readonly target: ModelPath;
  readonly value: NormalizedRuleExpression;
}

export interface CompiledEffectAction {
  readonly kind: "effect";
  readonly actions: readonly CompiledEffectSetValue[];
}

export type CompiledRuleAction =
  | CompiledStateAction
  | CompiledComputedAction
  | CompiledValidationAction
  | CompiledEffectAction;

export interface CompiledRule {
  readonly id: string;
  readonly kind: RuleKind;
  readonly target: ModelPath;
  readonly when?: NormalizedRuleExpression;
  readonly dependencies: readonly ModelPath[];
  readonly functionKeys: readonly string[];
  readonly action: CompiledRuleAction;
}

export interface SerializationPlan {
  readonly serializeInactive: boolean;
  readonly serializer?: string;
  readonly valueInitializer?: string;
}

export interface RuleModel {
  readonly rules: readonly CompiledRule[];
  readonly byPath: ReadonlyKeyedCollection<ModelPath, readonly string[]>;
  readonly computedOrder: readonly string[];
  readonly serialization: SerializationPlan;
}
