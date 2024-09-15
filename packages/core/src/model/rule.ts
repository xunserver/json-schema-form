import type { ModelPath } from "../path/index.js";
import type { RuleKind } from "../definition/rule-definition.js";
import type { ReadonlyKeyedCollection } from "./readonly-collection.js";

export interface CompiledRule {
  readonly id: string;
  readonly kind: RuleKind;
  readonly target: ModelPath;
}

export interface RuleModel {
  readonly rules: readonly CompiledRule[];
  readonly byPath: ReadonlyKeyedCollection<ModelPath, readonly string[]>;
}
