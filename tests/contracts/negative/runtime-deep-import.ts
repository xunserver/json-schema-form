import type { FormRuntime } from "@form/core/src/runtime/form-runtime.js";
import type { RuleDynamicsEngine } from "@form/core/src/runtime/rule/engine.js";
import { evaluateRuleExpression } from "@form/core/src/runtime/rule/evaluator.js";

export type LeakedRuntime = FormRuntime | RuleDynamicsEngine;
void evaluateRuleExpression;
