import { describe, expect, test } from "vitest";
import { createFormEnvironment } from "../../extension/create-form-environment.js";
import { definePlugin } from "../../extension/plugin.js";
import { defineRuleFunction } from "../../extension/define-rule-function.js";
import { evaluateRuleExpression } from "./evaluator.js";
import { parseRuleExpression } from "../../compiler/rule/expression.js";
import { FormRuntimeError } from "../error.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";

const scope = { targetTemplate: "", targetInstance: "" } as const;

function env(evaluate: (args: readonly unknown[]) => unknown) {
  return createFormEnvironment({
    plugins: [
      definePlugin({
        id: "company",
        dependsOn: ["core"],
        contributes: {
          ruleFunctions: {
            "company.fn": defineRuleFunction({
              name: "company.fn",
              evaluate: evaluate as (args: readonly never[]) => never,
            }),
          },
        },
      }),
    ],
  });
}

describe("rule expression evaluator", () => {
  test("evaluates operators, field reads, and named functions with cloned args", () => {
    const seen: unknown[] = [];
    const environment = env((args) => {
      seen.push(args);
      return { sum: (args[0] as number) + 1 };
    });
    const values = { country: "CN", amount: 10, tags: ["a", "b"] };
    expect(evaluateRuleExpression(parseRuleExpression({ eq: [{ field: "country" }, "CN"] }), values, scope, environment)).toBe(true);
    expect(evaluateRuleExpression(parseRuleExpression({ ne: [{ field: "country" }, "US"] }), values, scope, environment)).toBe(true);
    expect(evaluateRuleExpression(parseRuleExpression({ lt: [1, 2] }), values, scope, environment)).toBe(true);
    expect(evaluateRuleExpression(parseRuleExpression({ in: ["a", { field: "tags" }] }), values, scope, environment)).toBe(true);
    expect(evaluateRuleExpression(parseRuleExpression({ all: [true, { eq: [1, 1] }] }), values, scope, environment)).toBe(true);
    expect(evaluateRuleExpression(parseRuleExpression({ any: [false, true] }), values, scope, environment)).toBe(true);
    expect(evaluateRuleExpression(parseRuleExpression({ not: false }), values, scope, environment)).toBe(true);
    const result = evaluateRuleExpression(
      parseRuleExpression({ call: "company.fn", args: [{ field: "amount" }] }),
      values,
      scope,
      environment,
    );
    expect(result).toEqual({ sum: 11 });
    expect(Object.isFrozen(seen[0])).toBe(true);
    expect(seen[0]).toEqual([10]);
  });

  test("short-circuits logical operators without evaluating later calls", () => {
    let called = 0;
    const environment = env(() => {
      called += 1;
      return true;
    });
    expect(
      evaluateRuleExpression(
        parseRuleExpression({ all: [false, { call: "company.fn", args: [] }] }),
        {},
        scope,
        environment,
      ),
    ).toBe(false);
    expect(
      evaluateRuleExpression(
        parseRuleExpression({ any: [true, { call: "company.fn", args: [] }] }),
        {},
        scope,
        environment,
      ),
    ).toBe(true);
    expect(called).toBe(0);
  });

  test("isolates throw, thenable, and non-JSON function results", () => {
    const throwing = env(() => {
      throw new Error("boom");
    });
    const asyncFn = env(() => Promise.resolve(1));
    const bad = env(() => () => 1);
    for (const environment of [throwing, asyncFn, bad]) {
      try {
        evaluateRuleExpression(parseRuleExpression({ call: "company.fn", args: [] }), {}, scope, environment);
        throw new Error("expected FormRuntimeError");
      } catch (error) {
        expect(error).toBeInstanceOf(FormRuntimeError);
        expect((error as FormRuntimeError).diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.RULE_FUNCTION_FAILED);
      }
    }
  });
});
