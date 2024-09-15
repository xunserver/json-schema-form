import type { ModelPathLike } from "../model/path/index.js";
import type { JsonPrimitive, JsonValue } from "../definition/json-value.js";

export const RULE_OPERATOR_KEYS = [
  "eq",
  "ne",
  "lt",
  "lte",
  "gt",
  "gte",
  "in",
  "all",
  "any",
  "not",
] as const;

export type RuleOperatorKey = (typeof RULE_OPERATOR_KEYS)[number];

export type RuleScalar = JsonPrimitive;

export interface RuleConstExpression {
  readonly const: JsonValue;
}

export interface RuleFieldExpression {
  readonly field: ModelPathLike;
}

export interface RuleCallExpression {
  readonly call: string;
  readonly args: readonly RuleExpression[];
}

export interface RuleEqExpression {
  readonly eq: readonly [RuleExpression, RuleExpression];
}

export interface RuleNeExpression {
  readonly ne: readonly [RuleExpression, RuleExpression];
}

export interface RuleLtExpression {
  readonly lt: readonly [RuleExpression, RuleExpression];
}

export interface RuleLteExpression {
  readonly lte: readonly [RuleExpression, RuleExpression];
}

export interface RuleGtExpression {
  readonly gt: readonly [RuleExpression, RuleExpression];
}

export interface RuleGteExpression {
  readonly gte: readonly [RuleExpression, RuleExpression];
}

export interface RuleInExpression {
  readonly in: readonly [RuleExpression, RuleExpression];
}

export interface RuleAllExpression {
  readonly all: readonly RuleExpression[];
}

export interface RuleAnyExpression {
  readonly any: readonly RuleExpression[];
}

export interface RuleNotExpression {
  readonly not: RuleExpression;
}

export type RuleOperatorExpression =
  | RuleEqExpression
  | RuleNeExpression
  | RuleLtExpression
  | RuleLteExpression
  | RuleGtExpression
  | RuleGteExpression
  | RuleInExpression
  | RuleAllExpression
  | RuleAnyExpression
  | RuleNotExpression;

export type RuleExpression =
  | RuleScalar
  | RuleConstExpression
  | RuleFieldExpression
  | RuleCallExpression
  | RuleOperatorExpression;

export type RuleAst = RuleExpression;
