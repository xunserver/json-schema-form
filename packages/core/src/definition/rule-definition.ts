import type { ModelPathLike } from "../path/index.js";
import type { JsonValue } from "./json-value.js";
import type { RuleAst, RuleExpression } from "./rule-expression.js";

export type { RuleAst, RuleExpression };

export type RuleKind = "state" | "computed" | "validation" | "effect";

export type StateRuleAspect = "active" | "visible" | "disabled" | "readonly";

export interface StateRuleAction {
  readonly active?: RuleExpression;
  readonly visible?: RuleExpression;
  readonly disabled?: RuleExpression;
  readonly readonly?: RuleExpression;
}

export interface StateRuleDefinition {
  readonly kind: "state";
  readonly id?: string;
  readonly target: ModelPathLike;
  readonly when?: RuleExpression;
  readonly action: StateRuleAction;
}

export interface ComputedRuleAction {
  readonly value: RuleExpression;
}

export interface ComputedRuleDefinition {
  readonly kind: "computed";
  readonly id?: string;
  readonly target: ModelPathLike;
  readonly when?: RuleExpression;
  readonly action: ComputedRuleAction;
}

export interface ValidationFailureMetadata {
  readonly code: string;
  readonly message: string;
  readonly params?: JsonValue;
}

export interface ValidationRuleAction {
  readonly assertion: RuleExpression;
  readonly failure: ValidationFailureMetadata;
}

export interface ValidationRuleDefinition {
  readonly kind: "validation";
  readonly id?: string;
  readonly target: ModelPathLike;
  readonly when?: RuleExpression;
  readonly action: ValidationRuleAction;
}

export interface EffectSetValueAction {
  readonly type: "setValue";
  readonly target: ModelPathLike;
  readonly value: RuleExpression;
}

export interface EffectRuleAction {
  readonly actions: readonly EffectSetValueAction[];
}

export interface EffectRuleDefinition {
  readonly kind: "effect";
  readonly id?: string;
  readonly target?: ModelPathLike;
  readonly when?: RuleExpression;
  readonly action: EffectRuleAction;
}

export type RuleDefinition =
  | StateRuleDefinition
  | ComputedRuleDefinition
  | ValidationRuleDefinition
  | EffectRuleDefinition;
