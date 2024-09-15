import { describe, expect, test } from "vitest";
import { parseRuleExpression, RuleParseError, collectFieldPaths, collectCallNames } from "./expression.js";

describe("RuleExpression parser", () => {
  test("accepts scalars, const, field, call, and operators", () => {
    expect(parseRuleExpression(true)).toEqual({ kind: "literal", value: true });
    expect(parseRuleExpression({ const: { tax: 0.1 } })).toEqual({ kind: "const", value: { tax: 0.1 } });
    expect(parseRuleExpression({ field: "country" })).toEqual({ kind: "field", path: "country" });
    expect(parseRuleExpression({ call: "company.tax", args: [{ field: "amount" }] })).toEqual({
      kind: "call",
      name: "company.tax",
      args: [{ kind: "field", path: "amount" }],
    });
    expect(parseRuleExpression({ eq: [{ field: "country" }, "CN"] })).toEqual({
      kind: "eq",
      left: { kind: "field", path: "country" },
      right: { kind: "literal", value: "CN" },
    });
  });

  test("extracts deterministic field and call order without executing providers", () => {
    const parsed = parseRuleExpression({
      all: [{ field: "country" }, { call: "company.tax", args: [{ field: "amount" }, { field: "country" }] }],
    });
    expect(collectFieldPaths(parsed)).toEqual(["country", "amount"]);
    expect(collectCallNames(parsed)).toEqual(["company.tax"]);
  });

  test("does not retain authoring aliases", () => {
    const authored: { eq: [unknown, unknown] } = { eq: [{ field: "a" }, 1] };
    const parsed = parseRuleExpression(authored);
    authored.eq[1] = 2;
    expect(parsed).toEqual({
      kind: "eq",
      left: { kind: "field", path: "a" },
      right: { kind: "literal", value: 1 },
    });
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  test.each([
    [{ eq: [1, 2], ne: [1, 2] }, "multi-operator"],
    [() => true, "function"],
    [Promise.resolve(1), "promise"],
    [{ get x() { return 1; } }, "accessor-property"],
    [{ field: "products[0].name" }, "invalid-field"],
    [new Date(), "runtime-object"],
  ] as const)("rejects %j", (input, reason) => {
    expect(() => parseRuleExpression(input)).toThrow(RuleParseError);
    try {
      parseRuleExpression(input);
    } catch (error) {
      expect((error as RuleParseError).reason).toBe(reason);
    }
  });

  test("rejects cycles", () => {
    const cyclic: Record<string, unknown> = { const: {} };
    (cyclic as { const: Record<string, unknown> }).const.self = cyclic;
    expect(() => parseRuleExpression(cyclic)).toThrow(RuleParseError);
  });
});
