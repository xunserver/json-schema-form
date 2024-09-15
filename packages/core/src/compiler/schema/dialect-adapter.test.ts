import { describe, expect, test } from "vitest";
import { compileForm } from "../compile-form.js";
import { CompileError } from "../../model/compile-error.js";
import { SCHEMA_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import { createFormEnvironment } from "../../extension/create-form-environment.js";
import { definePlugin } from "../../extension/plugin.js";
import { defineForm } from "../../definition/define-form.js";
import type { SchemaDialectDefinition } from "../../extension/contributions.js";
import { runSchemaFrontend } from "./frontend.js";

const DRAFT07 = "http://json-schema.org/draft-07/schema#";

function draft07Adapter(overrides: Partial<SchemaDialectDefinition> = {}): SchemaDialectDefinition {
  return {
    name: "draft-07",
    dialects: [DRAFT07, "http://json-schema.org/draft-07/schema"],
    convert(schema) {
      if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
        return { schema };
      }
      const copy = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
      copy.$schema = "https://json-schema.org/draft/2020-12/schema";
      if (typeof copy.id === "string" && copy.$id === undefined) {
        copy.$id = copy.id;
        delete copy.id;
      }
      if (copy.definitions !== undefined && copy.$defs === undefined) {
        copy.$defs = copy.definitions;
        delete copy.definitions;
      }
      return { schema: copy };
    },
    ...overrides,
  };
}

function draft07Environment(adapter = draft07Adapter()) {
  return createFormEnvironment({
    plugins: [
      definePlugin({
        id: "legacy",
        dependsOn: ["core"],
        contributes: { schemaDialects: { "draft-07": adapter } },
      }),
    ],
  });
}

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

describe("dialect adapters", () => {
  test("converts a draft-07 schema once and compiles it as 2020-12", () => {
    let calls = 0;
    const environment = draft07Environment({
      ...draft07Adapter(),
      convert(schema) {
        calls += 1;
        return draft07Adapter().convert(schema);
      },
    });
    const definition = defineForm({
      schema: {
        $schema: DRAFT07,
        type: "object",
        properties: { name: { type: "string" } },
      },
    });
    const frozen = JSON.parse(JSON.stringify(definition));
    const first = compileForm(definition, { environment });
    const second = compileForm(definition, { environment });
    expect(calls).toBe(2);
    expect(first.model.ui.fields.get("name")?.widget).toBe("text");
    expect(first.diagnostics.some((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.DIALECT_CONVERTED)).toBe(true);
    expect(first.diagnostics.find((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.DIALECT_CONVERTED)?.pluginId).toBe(
      "legacy",
    );
    expect(definition).toEqual(frozen);
    expect(first.model.data.nodes.size).toBe(second.model.data.nodes.size);
    expect(first.diagnostics.map((item) => item.code)).toEqual(second.diagnostics.map((item) => item.code));
  });

  test("keeps invalid-dialect when no adapter is installed", () => {
    const result = runSchemaFrontend({ $schema: DRAFT07, type: "string" });
    expect(result.graph).toBeUndefined();
    expect(result.diagnostics.snapshot()[0]?.code).toBe(SCHEMA_DIAGNOSTIC_CODES.INVALID_DIALECT);
    const error = expectCompileError(() =>
      compileForm(defineForm({ schema: { $schema: DRAFT07, type: "string" } })),
    );
    expect(error.diagnostics[0]?.code).toBe(SCHEMA_DIAGNOSTIC_CODES.INVALID_DIALECT);
  });

  test("blocks throw, thenable, non-JSON, and non-canonical adapter results", () => {
    const cases: Array<{ convert: SchemaDialectDefinition["convert"]; reason: string }> = [
      {
        convert: () => {
          throw new Error("secret stack");
        },
        reason: "threw",
      },
      {
        convert: () => Promise.resolve({ schema: { type: "string" } }) as never,
        reason: "thenable",
      },
      {
        convert: () => ({ schema: () => undefined }) as never,
        reason: "non-json",
      },
      {
        convert: () => ({ schema: { $schema: DRAFT07, type: "string" } }),
        reason: "non-canonical",
      },
    ];
    for (const item of cases) {
      const environment = draft07Environment(draft07Adapter({ convert: item.convert }));
      const error = expectCompileError(() =>
        compileForm(defineForm({ schema: { $schema: DRAFT07, type: "string" } }), { environment }),
      );
      expect(error.diagnostics[0]?.code).toBe(SCHEMA_DIAGNOSTIC_CODES.DIALECT_ADAPTER_FAILED);
      expect(error.diagnostics[0]?.source).toBe("schema");
      expect(error.diagnostics[0]?.pluginId).toBe("legacy");
      expect(error.diagnostics[0]?.schemaPath).toBe("#");
      expect(JSON.stringify(error.diagnostics[0])).not.toMatch(/secret stack/);
      expect(error).not.toHaveProperty("model");
    }
  });

  test("merges adapter warnings with pluginId", () => {
    const environment = draft07Environment(
      draft07Adapter({
        convert(schema) {
          const converted = draft07Adapter().convert(schema);
          return {
            ...converted,
            diagnostics: [{ severity: "warning", message: "dropped exclusive syntax", code: "legacy.drop" }],
          };
        },
      }),
    );
    const result = compileForm(defineForm({ schema: { $schema: DRAFT07, type: "string" } }), { environment });
    expect(result.diagnostics.some((item) => item.message === "dropped exclusive syntax" && item.pluginId === "legacy")).toBe(
      true,
    );
  });

  test("warns on embedded non-canonical $schema instead of silently treating it as 2020-12", () => {
    const environment = draft07Environment();
    const result = compileForm(
      defineForm({
        schema: {
          $schema: DRAFT07,
          type: "object",
          properties: {
            nested: {
              $schema: DRAFT07,
              type: "string",
            },
          },
        },
      }),
      { environment },
    );
    const embedded = result.diagnostics.find((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.EMBEDDED_DIALECT);
    expect(embedded?.schemaPath).toBe("#/properties/nested/$schema");
    expect(embedded?.metadata).toMatchObject({ dialect: DRAFT07 });
    expect(result.diagnostics.find((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.DIALECT_CONVERTED)?.pluginId).toBe(
      "legacy",
    );
  });
});
