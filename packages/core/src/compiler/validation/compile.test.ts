import { describe, expect, test } from "vitest";
import { compileForm } from "../compile-form.js";
import { CompileError } from "../../model/compile-error.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import { createFormEnvironment } from "../../extension/create-form-environment.js";
import { definePlugin } from "../../extension/plugin.js";
import { defineValidator } from "../../extension/define-validator.js";
import { defineForm } from "../../definition/define-form.js";

const schema = {
  type: "object" as const,
  properties: {
    email: { type: "string" as const },
    profile: {
      type: "object" as const,
      properties: {
        name: { type: "string" as const },
      },
    },
    items: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          sku: { type: "string" as const },
          qty: { type: "number" as const },
        },
      },
    },
    others: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          sku: { type: "string" as const },
        },
      },
    },
  },
};

function expectCompileError(run: () => unknown): CompileError {
  try {
    const result = run();
    throw new Error(`Expected CompileError but received ${String(result)}`);
  } catch (error) {
    if (error instanceof CompileError) {
      return error;
    }
    throw error;
  }
}

function environmentWith(validators: Record<string, ReturnType<typeof defineValidator>>) {
  return createFormEnvironment({
    plugins: [
      definePlugin({
        id: "company",
        dependsOn: ["core"],
        contributes: { validators },
      }),
    ],
  });
}

describe("validation compiler", () => {
  test("compiled output is immutable and ignores later input mutation", () => {
    const validators = {
      "company.format": defineValidator({
        name: "company.format",
        kind: "sync",
        validate: () => [],
      }),
    };
    const definition = {
      schema,
      config: {
        schemaValidator: "ajv-2020",
        validators: [
          {
            validator: "company.format",
            target: "email",
            dependencies: ["profile.name"],
            options: { min: 1 },
          },
        ],
      },
    };
    const environment = environmentWith({
      ...validators,
      "ajv-2020": defineValidator({
        name: "ajv-2020",
        kind: "schema-adapter",
        validateAll: () => [],
      }),
    });
    const result = compileForm(definition, { environment });
    definition.config.validators[0]!.options.min = 99;
    expect(result.model.validation.custom[0]?.options).toEqual({ min: 1 });
    expect(Object.isFrozen(result.model.validation)).toBe(true);
    expect(result.model.validation.schema.adapterKey).toBe("ajv-2020");
    expect(result.model.validation.custom[0]).not.toHaveProperty("validate");
  });

  test("rejects missing key, kind mismatch and invalid trigger without a partial model", () => {
    const environment = environmentWith({
      "company.format": defineValidator({
        name: "company.format",
        kind: "sync",
        validate: () => [],
      }),
      "ajv-2020": defineValidator({
        name: "ajv-2020",
        kind: "schema-adapter",
        validateAll: () => [],
      }),
    });
    const error = expectCompileError(() =>
      compileForm(
        defineForm({
          schema,
          config: {
            schemaValidator: "ajv-2020",
            validators: [
              { validator: "missing", target: "email", dependencies: [] },
              { validator: "ajv-2020", target: "email", dependencies: [] },
              { validator: "company.format", target: "email", dependencies: [], trigger: "nope" },
            ],
          },
        }),
        { environment },
      ),
    );
    expect(error.diagnostics.map((item) => item.code).sort()).toEqual(
      [
        COMPILER_DIAGNOSTIC_CODES.VALIDATOR_INVALID_TRIGGER,
        COMPILER_DIAGNOSTIC_CODES.VALIDATOR_KIND_MISMATCH,
        COMPILER_DIAGNOSTIC_CODES.VALIDATOR_MISSING,
      ].sort(),
    );
    expect(error).not.toHaveProperty("model");
  });

  test("resolves root, same-item and ancestor scopes and rejects sibling collection reads", () => {
    const environment = environmentWith({
      "company.ok": defineValidator({ name: "company.ok", kind: "sync", validate: () => [] }),
      "company.bad": defineValidator({ name: "company.bad", kind: "sync", validate: () => [] }),
    });
    const ok = compileForm(
      defineForm({
        schema,
        config: {
          validators: [
            { validator: "company.ok", target: "items[].sku", dependencies: ["items[].qty", "email"] },
            { validator: "company.ok", target: "profile.name", dependencies: ["profile"] },
          ],
        },
      }),
      { environment },
    );
    expect(ok.model.validation.custom.map((plan) => plan.target)).toEqual(["items[].sku", "profile.name"]);

    const bad = expectCompileError(() =>
      compileForm(
        defineForm({
          schema,
          config: {
            validators: [
              { validator: "company.bad", target: "items[].sku", dependencies: ["others[].sku"] },
            ],
          },
        }),
        { environment },
      ),
    );
    expect(bad.diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.VALIDATOR_SCOPE_AMBIGUOUS);
  });

  test("consumes Validation Rule handoff as custom source owners", () => {
    const result = compileForm(
      defineForm({
        schema,
        rules: [
          {
            kind: "validation",
            id: "min-qty",
            target: "items[].qty",
            action: { assertion: { gt: [{ field: "items[].qty" }, 0] }, failure: { code: "min", message: "needed" } },
          },
        ],
      }),
    );
    expect(result.model.validation.rules).toEqual([
      expect.objectContaining({
        id: "rule:min-qty",
        ruleId: "min-qty",
        target: "items[].qty",
        code: "min",
        message: "needed",
      }),
    ]);
  });

  test("selects explicit, unique, unbound and ambiguous schema adapters", () => {
    const one = environmentWith({
      "ajv-2020": defineValidator({ name: "ajv-2020", kind: "schema-adapter", validateAll: () => [] }),
    });
    const explicit = compileForm(defineForm({ schema, config: { schemaValidator: "ajv-2020" } }), {
      environment: one,
    });
    expect(explicit.model.validation.schema).toMatchObject({ adapterKey: "ajv-2020", unbound: false });

    const unique = compileForm(defineForm({ schema }), { environment: one });
    expect(unique.model.validation.schema.adapterKey).toBe("ajv-2020");

    const none = compileForm(defineForm({ schema }));
    expect(none.model.validation.schema.unbound).toBe(true);
    expect(none.diagnostics.some((item) => item.code === COMPILER_DIAGNOSTIC_CODES.SCHEMA_ADAPTER_UNBOUND)).toBe(
      true,
    );

    const many = environmentWith({
      "ajv-2020": defineValidator({ name: "ajv-2020", kind: "schema-adapter", validateAll: () => [] }),
      "other-schema": defineValidator({ name: "other-schema", kind: "schema-adapter", validateAll: () => [] }),
    });
    const ambiguous = expectCompileError(() => compileForm(defineForm({ schema }), { environment: many }));
    expect(ambiguous.diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.SCHEMA_ADAPTER_AMBIGUOUS);
  });

  test("defaults trigger and presentation independently of execution plans", () => {
    const result = compileForm(defineForm({ schema }));
    expect(result.model.validation.validateOn).toBe("submit");
    expect(result.model.validation.presentation.policy).toBe("touched-or-submitted");
    const configured = compileForm(
      defineForm({
        schema,
        config: { validateOn: "change", errorPresentation: "always" },
      }),
    );
    expect(configured.model.validation.validateOn).toBe("change");
    expect(configured.model.validation.presentation.policy).toBe("always");
    expect(configured.model.validation.custom).toEqual([]);
  });

  test("repeat compiles produce equivalent diagnostics without leaking providers", () => {
    const validate = (): never[] => [];
    const environment = environmentWith({
      "company.format": defineValidator({ name: "company.format", kind: "sync", validate }),
    });
    const definition = defineForm({
      schema,
      config: {
        validators: [
          { validator: "missing", target: "email", dependencies: [] },
          { validator: "company.format", target: "nope", dependencies: [] },
        ],
      },
    });
    const first = expectCompileError(() => compileForm(definition, { environment }));
    const second = expectCompileError(() => compileForm(definition, { environment }));
    expect(first.diagnostics.map((item) => item.code)).toEqual(second.diagnostics.map((item) => item.code));
    expect(JSON.stringify(first.diagnostics)).toEqual(JSON.stringify(second.diagnostics));
    expect(JSON.stringify(first.diagnostics)).not.toMatch(/function|validate/);
  });
});
