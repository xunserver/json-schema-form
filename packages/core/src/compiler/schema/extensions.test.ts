import { describe, expect, test } from "vitest";
import { compileForm } from "../compile-form.js";
import { CompileError } from "../../model/compile-error.js";
import { SCHEMA_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import { createFormEnvironment } from "../../extension/create-form-environment.js";
import { definePlugin } from "../../extension/plugin.js";
import { defineForm } from "../../definition/define-form.js";
import type { SchemaExtensionDefinition } from "../../extension/contributions.js";

function xUiExtension(overrides: Partial<SchemaExtensionDefinition> = {}): SchemaExtensionDefinition {
  return {
    name: "x-ui",
    keyword: "x-ui",
    split({ value }) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {};
      }
      return { fieldUI: value as never };
    },
    ...overrides,
  };
}

function extensionEnvironment(extension: SchemaExtensionDefinition = xUiExtension()) {
  return createFormEnvironment({
    plugins: [
      definePlugin({
        id: "company",
        dependsOn: ["core"],
        contributes: { schemaExtensions: { "x-ui": extension } },
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

describe("schema extensions", () => {
  test("splits x-ui into FieldUI and removes it from the canonical graph", () => {
    const environment = extensionEnvironment();
    const result = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            bio: { type: "string", "x-ui": { widget: "textarea", display: { label: "Bio" } } },
          },
        },
      } as never),
      { environment },
    );
    expect(result.model.ui.fields.get("bio")?.widget).toBe("textarea");
    expect(result.model.ui.fields.get("bio")?.display).toEqual({ label: "Bio" });
    expect(result.diagnostics.some((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.EXTENSION_APPLIED)).toBe(true);
    expect(
      JSON.stringify([...result.model.data.nodes.values()].map((node) => node.schemaRefs)),
    ).not.toContain("x-ui");
  });

  test("lets explicit UI Schema win overlapping keys with a warning", () => {
    const environment = extensionEnvironment();
    const result = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            bio: { type: "string", "x-ui": { widget: "textarea" } },
          },
        },
        uiSchema: { fields: { bio: { widget: "text" } } },
      } as never),
      { environment },
    );
    expect(result.model.ui.fields.get("bio")?.widget).toBe("text");
    const overlap = result.diagnostics.find((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.EXTENSION_OVERLAP);
    expect(overlap?.severity).toBe("warning");
    expect(overlap?.modelPath).toBe("bio");
    expect(overlap?.metadata).toMatchObject({ key: "widget", extension: "x-ui" });
  });

  test("applies array template locations as ModelPath templates", () => {
    const environment = extensionEnvironment();
    const result = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            products: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", "x-ui": { widget: "textarea" } },
                },
              },
            },
          },
        },
      } as never),
      { environment },
    );
    expect(result.model.ui.fields.get("products[].name")?.widget).toBe("textarea");
    expect([...result.model.ui.fields.keys()].some((path) => path.includes("[0]"))).toBe(false);
  });

  test("calls split once per instantiated ModelPath for shared $defs", () => {
    const modelPaths: string[] = [];
    const environment = extensionEnvironment({
      ...xUiExtension(),
      split(input) {
        modelPaths.push(input.modelPath);
        expect(Object.isFrozen(input)).toBe(true);
        return xUiExtension().split(input);
      },
    });
    compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            billingAddress: { $ref: "#/$defs/address" },
            shippingAddress: { $ref: "#/$defs/address" },
          },
          $defs: {
            address: { type: "object", properties: { street: { type: "string", "x-ui": { widget: "textarea" } } } },
          },
        },
      } as never),
      { environment },
    );
    expect(modelPaths.sort()).toEqual(["billingAddress.street", "shippingAddress.street"]);
  });

  test("does not apply fragments from unmapped if predicates", () => {
    const environment = extensionEnvironment();
    const result = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { name: { type: "string" } },
          if: { type: "object", properties: { flag: { type: "boolean", "x-ui": { widget: "textarea" } } } },
          then: { required: ["name"] },
        },
      } as never),
      { environment },
    );
    const unmapped = result.diagnostics.find((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.EXTENSION_UNMAPPED);
    expect(unmapped?.schemaPath).toBe("#/if/properties/flag/x-ui");
    expect([...result.model.ui.fields.values()].some((field) => field.widget === "textarea")).toBe(false);
  });

  test("keeps undeclared x-* as the previous warning-only behavior", () => {
    const result = compileForm(
      defineForm({
        schema: { type: "string", "x-legacy": { widget: "magic" } } as never,
      }),
    );
    expect(result.diagnostics.some((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.UNSUPPORTED_EXTENSION)).toBe(true);
    expect(result.model).toBeDefined();
  });

  test("appends extension rules and lets Rule compiler diagnose duplicate ids", () => {
    const environment = extensionEnvironment({
      name: "x-ui",
      keyword: "x-ui",
      split: () => ({
        rules: [{ id: "dup", kind: "state", target: "name", action: { visible: true } }],
      }),
    });
    const error = expectCompileError(() =>
      compileForm(
        defineForm({
          schema: {
            type: "object",
            properties: { name: { type: "string", "x-ui": { widget: "text" } } },
          },
          rules: [{ id: "dup", kind: "state", target: "name", action: { disabled: true } }],
        } as never),
        { environment },
      ),
    );
    expect(error.diagnostics.some((item) => item.code === COMPILER_DIAGNOSTIC_CODES.RULE_DUPLICATE_ID)).toBe(true);
  });

  test("blocks throw, thenable, and illegal fragments", () => {
    const cases: Array<SchemaExtensionDefinition["split"]> = [
      () => {
        throw new Error("secret stack");
      },
      () => Promise.resolve({}) as never,
      () => ({ fieldUI: { widget: () => "x" } }) as never,
    ];
    for (const split of cases) {
      const environment = extensionEnvironment(xUiExtension({ split }));
      const error = expectCompileError(() =>
        compileForm(
          defineForm({
            schema: { type: "object", properties: { bio: { type: "string", "x-ui": { widget: "textarea" } } } },
          } as never),
          { environment },
        ),
      );
      expect(error.diagnostics[0]?.code).toBe(SCHEMA_DIAGNOSTIC_CODES.EXTENSION_SPLIT_FAILED);
      expect(error.diagnostics[0]?.pluginId).toBe("company");
      expect(JSON.stringify(error.diagnostics[0])).not.toMatch(/secret stack/);
      expect(error).not.toHaveProperty("model");
    }
  });
});
