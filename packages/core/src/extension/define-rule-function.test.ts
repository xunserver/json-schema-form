import { describe, expect, test } from "vitest";
import { defineRuleFunction } from "./define-rule-function.js";
import { createFormEnvironment } from "./create-form-environment.js";
import { PLUGIN_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { expectBuildError, codesOf } from "./environment.test-utils.js";
import { definePlugin } from "./plugin.js";

describe("defineRuleFunction and named providers", () => {
  test("returns identity without installing", () => {
    const evaluate = (args: readonly never[]) => args[0] ?? null;
    const descriptor = { name: "company.tax", evaluate };
    const authored = defineRuleFunction(descriptor);
    expect(authored).toBe(descriptor);
    expect(createFormEnvironment().ruleFunctions.has("company.tax")).toBe(false);
  });

  test("accepts matching keys and exact overrides", () => {
    const first = definePlugin({
      id: "first",
      dependsOn: ["core"],
      contributes: {
        ruleFunctions: {
          "company.tax": defineRuleFunction({ name: "company.tax", evaluate: () => 1 }),
        },
        serializers: {
          "company.payload": { name: "company.payload", serialize: (value) => value },
        },
      },
    });
    const second = definePlugin({
      id: "second",
      dependsOn: ["core"],
      contributes: {
        ruleFunctions: {
          "company.tax": defineRuleFunction({ name: "company.tax", evaluate: () => 2 }),
        },
      },
    });
    const environment = createFormEnvironment({
      plugins: [first, second],
      overrides: [{ registry: "ruleFunctions", key: "company.tax", byPlugin: "second" }],
    });
    expect(environment.ruleFunctions.get("company.tax")?.evaluate([])).toBe(2);
    expect(environment.inspect("ruleFunctions", "company.tax")?.pluginId).toBe("second");
    expect(environment.serializers.get("company.payload")?.name).toBe("company.payload");
  });

  test("rejects name mismatch and invalid providers without a partial environment", () => {
    const mismatch = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "company",
            contributes: {
              ruleFunctions: {
                "company.tax": { name: "other.tax", evaluate: () => 1 },
              },
            },
          },
        ],
      }),
    );
    expect(codesOf(mismatch)).toEqual([PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR]);
    expect(mismatch.diagnostics[0]?.source).toBe("plugin");
    expect(mismatch.diagnostics[0]?.metadata).toMatchObject({
      registry: "ruleFunctions",
      key: "company.tax",
      name: "other.tax",
    });
    expect("environment" in mismatch).toBe(false);

    const invalid = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "company",
            contributes: {
              serializers: {
                "company.payload": { name: "company.payload" },
              },
            },
          },
        ],
      }),
    );
    expect(codesOf(invalid)).toEqual([PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR]);
  });
});
