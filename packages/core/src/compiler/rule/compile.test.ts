import { describe, expect, test } from "vitest";
import { compileForm } from "../compile-form.js";
import { CompileError } from "../../model/compile-error.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import { defineForm } from "../../definition/define-form.js";
import { createFormEnvironment } from "../../extension/create-form-environment.js";
import { definePlugin } from "../../extension/plugin.js";
import { defineRuleFunction } from "../../extension/define-rule-function.js";

const productSchema = {
  type: "object" as const,
  properties: {
    country: { type: "string" as const },
    taxRate: { type: "number" as const },
    subtotal: { type: "number" as const },
    total: { type: "number" as const },
    region: { type: "string" as const },
    products: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          quantity: { type: "number" as const },
          price: { type: "number" as const },
          total: { type: "number" as const },
        },
      },
    },
    orders: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: { amount: { type: "number" as const } },
      },
    },
  },
};

function expectCompileError(run: () => unknown): CompileError {
  try {
    run();
    throw new Error("expected CompileError");
  } catch (error) {
    if (error instanceof CompileError) {
      return error;
    }
    throw error;
  }
}

describe("Rule compiler", () => {
  test("compiles rules and a deterministic byPath index", () => {
    const tax = defineRuleFunction({
      name: "company.tax",
      evaluate: (args) => args[0] ?? 0,
    });
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "company",
          dependsOn: ["core"],
          contributes: { ruleFunctions: { "company.tax": tax } },
        }),
      ],
    });
    const first = compileForm(
      defineForm({
        schema: productSchema,
        rules: [
          {
            kind: "state",
            target: "country",
            action: { visible: { eq: [{ field: "country" }, "CN"] } },
          },
          {
            kind: "computed",
            target: "products[].total",
            action: {
              value: {
                call: "company.tax",
                args: [{ field: "products[].quantity" }],
              },
            },
          },
        ],
      }),
      { environment },
    );
    expect(first.model.rule.rules.map((rule) => rule.id)).toEqual([
      "rule:0000:state:country",
      "rule:0001:computed:products[].total",
    ]);
    expect(first.model.rule.byPath.get("country")).toEqual(["rule:0000:state:country"]);
    expect(first.model.rule.byPath.get("products[].quantity")).toEqual(["rule:0001:computed:products[].total"]);
    expect(first.model.rule.rules[1]?.functionKeys).toEqual(["company.tax"]);
    const second = compileForm(
      defineForm({
        schema: productSchema,
        rules: [
          {
            kind: "state",
            target: "country",
            action: { visible: { eq: [{ field: "country" }, "CN"] } },
          },
          {
            kind: "computed",
            target: "products[].total",
            action: {
              value: {
                call: "company.tax",
                args: [{ field: "products[].quantity" }],
              },
            },
          },
        ],
      }),
      { environment },
    );
    expect(second.model.rule.rules).toEqual(first.model.rule.rules);
    expect(second.model.rule.computedOrder).toEqual(first.model.rule.computedOrder);
    expect(second.model.rule.serialization).toEqual(first.model.rule.serialization);
    expect([...second.model.rule.byPath.entries()]).toEqual([...first.model.rule.byPath.entries()]);
    expect(() => {
      (first.model.rule.rules as { id: string }[]).push({ id: "x" });
    }).toThrow();
  });

  test("aggregates missing target and function diagnostics without a partial model", () => {
    const error = expectCompileError(() =>
      compileForm(
        defineForm({
          schema: productSchema,
          rules: [
            { kind: "state", target: "missing", action: { visible: true } },
            {
              kind: "computed",
              target: "total",
              action: { value: { call: "missing.fn", args: [] } },
            },
          ],
        }),
      ),
    );
    expect(error.diagnostics.map((item) => item.code).sort()).toEqual([
      COMPILER_DIAGNOSTIC_CODES.RULE_MISSING_FUNCTION,
      COMPILER_DIAGNOSTIC_CODES.RULE_MISSING_TARGET,
    ]);
  });

  test("accepts root and same-item array scope and rejects sibling or descendant collection", () => {
    const ok = compileForm(
      defineForm({
        schema: productSchema,
        rules: [
          { kind: "computed", target: "products[].total", action: { value: { field: "country" } } },
        ],
      }),
    );
    expect(ok.model.rule.rules).toHaveLength(1);
    const sibling = expectCompileError(() =>
      compileForm(
        defineForm({
          schema: productSchema,
          rules: [
            {
              kind: "computed",
              target: "products[].total",
              action: { value: { field: "orders[].amount" } },
            },
          ],
        }),
      ),
    );
    expect(sibling.diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.RULE_SCOPE_AMBIGUOUS);
    const descendant = expectCompileError(() =>
      compileForm(
        defineForm({
          schema: {
            type: "object",
            properties: {
              products: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    lines: { type: "array", items: { type: "object", properties: { sku: { type: "string" } } } },
                  },
                },
              },
            },
          },
          rules: [
            {
              kind: "computed",
              target: "products[].name",
              action: { value: { field: "products[].lines[].sku" } },
            },
          ],
        }),
      ),
    );
    expect(descendant.diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.RULE_SCOPE_AMBIGUOUS);
  });

  test("rejects active root, duplicate ids, computed cycles and multi-writers", () => {
    const activeRoot = expectCompileError(() =>
      compileForm(
        defineForm({
          schema: productSchema,
          rules: [{ kind: "state", target: "", action: { active: false } }],
        }),
      ),
    );
    expect(activeRoot.diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.RULE_ACTIVE_ROOT);

    const duplicate = expectCompileError(() =>
      compileForm(
        defineForm({
          schema: productSchema,
          rules: [
            { id: "same", kind: "state", target: "country", action: { visible: true } },
            { id: "same", kind: "state", target: "region", action: { visible: true } },
          ],
        }),
      ),
    );
    expect(duplicate.diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.RULE_DUPLICATE_ID);

    const cycle = expectCompileError(() =>
      compileForm(
        defineForm({
          schema: productSchema,
          rules: [
            { kind: "computed", target: "subtotal", action: { value: { field: "total" } } },
            { kind: "computed", target: "total", action: { value: { field: "subtotal" } } },
          ],
        }),
      ),
    );
    expect(cycle.diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.RULE_COMPUTED_CYCLE);

    const writers = expectCompileError(() =>
      compileForm(
        defineForm({
          schema: productSchema,
          rules: [
            { kind: "computed", target: "total", action: { value: 1 } },
            { kind: "computed", target: "total", action: { value: 2 } },
          ],
        }),
      ),
    );
    expect(writers.diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.RULE_MULTI_WRITER);
    expect(cycle.diagnostics[0]?.metadata).toMatchObject({
      cycle: expect.arrayContaining([
        "rule:0000:computed:subtotal",
        "rule:0001:computed:total",
      ]),
    });

    const invalidState = expectCompileError(() =>
      compileForm(
        defineForm({
          schema: productSchema,
          rules: [{ kind: "state", target: "country", action: { visible: 1 } }],
        }),
      ),
    );
    expect(invalidState.diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_STATE);
  });

  test("compiles serializer plan defaults and rejects missing keys", () => {
    const defaults = compileForm(defineForm({ schema: productSchema }));
    expect(defaults.model.rule.serialization).toEqual({ serializeInactive: false });
    const configured = compileForm(
      defineForm({
        schema: productSchema,
        config: { serializeInactive: true, serializer: "company.payload" },
      }),
      {
        environment: createFormEnvironment({
          plugins: [
            definePlugin({
              id: "company",
              dependsOn: ["core"],
              contributes: {
                serializers: {
                  "company.payload": { name: "company.payload", serialize: (value) => value },
                },
              },
            }),
          ],
        }),
      },
    );
    expect(configured.model.rule.serialization).toEqual({
      serializeInactive: true,
      serializer: "company.payload",
    });
    const missing = expectCompileError(() =>
      compileForm(
        defineForm({
          schema: productSchema,
          config: { serializer: "missing" },
        }),
      ),
    );
    expect(missing.diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.SERIALIZER_MISSING);
  });

  test("rejects effect callbacks and keeps validation metadata serializable", () => {
    const error = expectCompileError(() =>
      compileForm(
        defineForm({
          schema: productSchema,
          rules: [
            {
              kind: "effect",
              action: { actions: [{ type: "submit" as never, target: "region", value: "x" }] },
            },
          ],
        }),
      ),
    );
    expect(error.diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_ACTION);
    const ok = compileForm(
      defineForm({
        schema: productSchema,
        rules: [
          {
            kind: "validation",
            target: "country",
            action: { assertion: true, failure: { code: "required", message: "needed", params: { min: 1 } } },
          },
          {
            kind: "effect",
            target: "country",
            action: { actions: [{ type: "setValue", target: "region", value: "CN" }] },
          },
        ],
      }),
    );
    expect(ok.model.rule.rules[0]?.action.kind).toBe("validation");
    expect(ok.model.validation.validators).toEqual([]);
    expect(ok.model.rule.rules[1]?.action.kind).toBe("effect");
    expect(JSON.stringify(ok.model.rule)).not.toMatch(/evaluate|serialize\(/);
    expect(ok.model).not.toHaveProperty("environment");
    expect(ok.model.rule.byPath).not.toHaveProperty("set");
  });

  test("orders independent and chained computed rules deterministically", () => {
    const chained = compileForm(
      defineForm({
        schema: productSchema,
        rules: [
          { kind: "computed", target: "total", action: { value: { field: "subtotal" } } },
          { kind: "computed", target: "subtotal", action: { value: { field: "taxRate" } } },
        ],
      }),
    );
    expect(chained.model.rule.computedOrder).toEqual([
      "rule:0001:computed:subtotal",
      "rule:0000:computed:total",
    ]);
    const independent = compileForm(
      defineForm({
        schema: productSchema,
        rules: [
          { kind: "computed", target: "subtotal", action: { value: 1 } },
          { kind: "computed", target: "taxRate", action: { value: 2 } },
        ],
      }),
    );
    expect(independent.model.rule.computedOrder).toEqual([
      "rule:0000:computed:subtotal",
      "rule:0001:computed:taxRate",
    ]);
  });
});
