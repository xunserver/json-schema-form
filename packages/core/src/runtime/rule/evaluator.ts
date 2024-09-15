import type { JsonValue } from "../../definition/json-value.js";
import type { FormEnvironment } from "../../extension/environment.js";
import type { NormalizedRuleExpression } from "../../model/rule.js";
import type { InstancePath, ModelPath } from "../../path/types.js";
import { bindTemplatePath } from "../../path/bind-path.js";
import { parseInstancePath } from "../../path/instance-path.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import { runtimeDiagnostic } from "../diagnostics.js";
import { FormRuntimeError } from "../error.js";
import { cloneJsonValue, getJsonAt, jsonEqual, JsonCloneError } from "../json-value.js";
import { sortRuntimeDiagnostics } from "../diagnostics.js";

export interface EvaluationScope {
  readonly targetTemplate: ModelPath;
  readonly targetInstance: InstancePath;
}

export function evaluateRuleExpression(
  expression: NormalizedRuleExpression,
  values: JsonValue,
  scope: EvaluationScope,
  environment: FormEnvironment,
): JsonValue {
  return evalNode(expression, values, scope, environment);
}

function evalNode(
  expression: NormalizedRuleExpression,
  values: JsonValue,
  scope: EvaluationScope,
  environment: FormEnvironment,
): JsonValue {
  switch (expression.kind) {
    case "literal":
      return expression.value;
    case "const":
      return expression.value;
    case "field": {
      const instance = bindTemplatePath(expression.path, scope.targetTemplate, scope.targetInstance);
      const segments = parseInstancePath(instance) ?? [];
      const value = getJsonAt(values, segments);
      return value === undefined ? null : value;
    }
    case "call": {
      const args = expression.args.map((arg) => evalNode(arg, values, scope, environment));
      return callFunction(expression.name, args, environment);
    }
    case "eq":
      return jsonEqual(
        evalNode(expression.left, values, scope, environment),
        evalNode(expression.right, values, scope, environment),
      );
    case "ne":
      return !jsonEqual(
        evalNode(expression.left, values, scope, environment),
        evalNode(expression.right, values, scope, environment),
      );
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      return compare(
        expression.kind,
        evalNode(expression.left, values, scope, environment),
        evalNode(expression.right, values, scope, environment),
      );
    case "in": {
      const left = evalNode(expression.left, values, scope, environment);
      const right = evalNode(expression.right, values, scope, environment);
      if (!Array.isArray(right)) {
        throw fail("in operator requires an array haystack");
      }
      return right.some((item) => jsonEqual(item, left));
    }
    case "all": {
      for (const item of expression.items) {
        if (!isTrue(evalNode(item, values, scope, environment))) {
          return false;
        }
      }
      return true;
    }
    case "any": {
      for (const item of expression.items) {
        if (isTrue(evalNode(item, values, scope, environment))) {
          return true;
        }
      }
      return false;
    }
    case "not":
      return !isTrue(evalNode(expression.operand, values, scope, environment));
  }
}

function callFunction(name: string, args: readonly JsonValue[], environment: FormEnvironment): JsonValue {
  const provider = environment.ruleFunctions.get(name);
  if (provider === undefined) {
    throw fail(`Rule function "${name}" is not registered`, { functionKey: name });
  }
  let frozenArgs: readonly JsonValue[];
  try {
    frozenArgs = cloneJsonValue(args) as readonly JsonValue[];
  } catch {
    throw fail("Rule function arguments must be JSON-compatible", { functionKey: name });
  }
  let result: unknown;
  try {
    result = provider.evaluate(frozenArgs);
  } catch {
    throw fail(`Rule function "${name}" failed`, { functionKey: name });
  }
  if (isThenable(result)) {
    throw fail(`Rule function "${name}" returned a thenable`, { functionKey: name });
  }
  try {
    return cloneJsonValue(result);
  } catch (error) {
    const reason = error instanceof JsonCloneError ? error.reason : "non-json";
    throw fail(`Rule function "${name}" returned a non-JSON result`, { functionKey: name, reason });
  }
}

function compare(kind: "lt" | "lte" | "gt" | "gte", left: JsonValue, right: JsonValue): boolean {
  if (typeof left !== "number" || typeof right !== "number") {
    throw fail("numeric comparison requires finite numbers");
  }
  switch (kind) {
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
  }
}

function isTrue(value: JsonValue): boolean {
  return value === true;
}

function isThenable(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function fail(message: string, metadata?: Readonly<Record<string, unknown>>): FormRuntimeError {
  return new FormRuntimeError(
    sortRuntimeDiagnostics([
      runtimeDiagnostic({
        code: RUNTIME_DIAGNOSTIC_CODES.RULE_FUNCTION_FAILED,
        message,
        ...(metadata === undefined ? {} : { metadata }),
      }),
    ]),
  );
}
