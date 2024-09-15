import type { ModelPathLike } from "../path/index.js";

export type RuleKind = "state" | "computed" | "validation" | "effect";

export type RuleAst = Readonly<Record<string, unknown>>;

export interface RuleDefinition {
  readonly id?: string;
  readonly kind?: RuleKind;
  readonly when?: RuleAst;
  readonly then?: RuleAst;
  readonly target?: ModelPathLike;
}
