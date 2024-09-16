import type { FormRuntime } from "@xunserver-jsf/core/src/runtime/form-runtime.js";
import type { RuleDynamicsEngine } from "@xunserver-jsf/core/src/runtime/rule/engine.js";
import { evaluateRuleExpression } from "@xunserver-jsf/core/src/runtime/rule/evaluator.js";

export type LeakedRuntime = FormRuntime | RuleDynamicsEngine;
void evaluateRuleExpression;
