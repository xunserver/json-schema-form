import { describe, expect, test } from "vitest";
import { defineValidator } from "./define-validator.js";
import { createFormEnvironment } from "./create-form-environment.js";
import { PLUGIN_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { expectBuildError, codesOf } from "./environment.test-utils.js";
import { definePlugin } from "./plugin.js";

describe("defineValidator", () => {
  test("returns identity without executing or installing", () => {
    let ran = 0;
    const descriptor = {
      name: "company.unique-email",
      kind: "sync" as const,
      validate: () => {
        ran += 1;
        return [];
      },
    };
    const authored = defineValidator(descriptor);
    expect(authored).toBe(descriptor);
    expect(ran).toBe(0);
    expect(createFormEnvironment().validators.has("company.unique-email")).toBe(false);
  });

  test("same name authoring does not conflict until Environment registration", () => {
    const first = defineValidator({
      name: "company.unique-email",
      kind: "sync",
      validate: () => [{ code: "a" }],
    });
    const second = defineValidator({
      name: "company.unique-email",
      kind: "async",
      validate: async () => [{ code: "b" }],
    });
    expect(first).not.toBe(second);
    expect(createFormEnvironment().validators.has("company.unique-email")).toBe(false);
  });

  test("accepts matching keys and exact overrides", () => {
    const first = definePlugin({
      id: "first",
      dependsOn: ["core"],
      contributes: {
        validators: {
          "company.unique-email": defineValidator({
            name: "company.unique-email",
            kind: "async",
            validate: async () => [],
          }),
        },
      },
    });
    const second = definePlugin({
      id: "second",
      dependsOn: ["core"],
      contributes: {
        validators: {
          "company.unique-email": defineValidator({
            name: "company.unique-email",
            kind: "async",
            validate: async () => [{ code: "taken" }],
          }),
        },
      },
    });
    const environment = createFormEnvironment({
      plugins: [first, second],
      overrides: [{ registry: "validators", key: "company.unique-email", byPlugin: "second" }],
    });
    expect(environment.validators.get("company.unique-email")?.kind).toBe("async");
    expect(environment.inspect("validators", "company.unique-email")?.pluginId).toBe("second");
    expect(Object.isFrozen(environment.validators.get("company.unique-email"))).toBe(true);
  });

  test("rejects key/name mismatch and missing incremental methods atomically", () => {
    const mismatch = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "company",
            contributes: {
              validators: {
                "company.unique-email": {
                  name: "other.email",
                  kind: "async",
                  validate: async () => [],
                },
              },
            },
          },
        ],
      }),
    );
    expect(codesOf(mismatch)).toEqual([PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR]);
    expect(mismatch.diagnostics[0]?.source).toBe("plugin");
    expect(mismatch.diagnostics[0]?.metadata).toMatchObject({
      registry: "validators",
      key: "company.unique-email",
      name: "other.email",
    });
    expect("environment" in mismatch).toBe(false);

    const capability = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "company",
            contributes: {
              validators: {
                "company.schema": {
                  name: "company.schema",
                  kind: "schema-adapter",
                  capabilities: { validateAffected: true },
                  validateAll: () => [],
                },
              },
            },
          },
        ],
      }),
    );
    expect(codesOf(capability)).toEqual([PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR]);
    expect(capability.diagnostics[0]?.metadata).toMatchObject({
      registry: "validators",
      key: "company.schema",
      capability: "validateAffected",
    });
  });
});
