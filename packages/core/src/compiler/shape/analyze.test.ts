import { describe, expect, test } from "vitest";
import { compileForm } from "../compile-form.js";
import { SCHEMA_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import type { ObjectDataNode, ScalarDataNode, UnionDataNode } from "../../model/data.js";

describe("Shape Analyzer", () => {
  test("infers an object from properties and emits schema.shape-inferred", () => {
    const result = compileForm({ schema: { properties: { name: { type: "string" } } } });
    expect(result.model.data.root.kind).toBe("object");
    const warning = result.diagnostics.find((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.SHAPE_INFERRED);
    expect(warning?.severity).toBe("warning");
    expect(warning?.schemaPath).toBe("#");
    expect(result.model.diagnostics).toBe(result.diagnostics);
  });

  test("distinguishes list, tuple, and nullable scalar shapes", () => {
    const list = compileForm({
      schema: { type: "array", items: { type: "string" } },
    });
    expect(list.model.data.root.kind).toBe("array");
    if (list.model.data.root.kind === "array") {
      expect(list.model.data.root.form).toBe("list");
      expect(list.model.data.nodes.get("[]")?.kind).toBe("scalar");
    }

    const tuple = compileForm({
      schema: { type: "array", prefixItems: [{ type: "string" }, { type: "number" }] },
    });
    expect(tuple.model.data.root.kind).toBe("array");
    if (tuple.model.data.root.kind === "array") {
      expect(tuple.model.data.root.form).toBe("tuple");
    }
    expect(tuple.model.data.nodes.get("[#0]")?.kind).toBe("scalar");
    expect(tuple.model.data.nodes.get("[#1]")?.kind).toBe("scalar");
    expect(tuple.model.data.nodes.has("0" as never)).toBe(false);

    const nullable = compileForm({ schema: { type: ["string", "null"] } });
    const root = nullable.model.data.root as ScalarDataNode;
    expect(root.kind).toBe("scalar");
    expect(root.valueType).toBe("string");
    expect(root.nullable).toBe(true);
  });

  test("keeps enum and format as scalar metadata without changing shape", () => {
    const result = compileForm({
      schema: { type: "string", enum: ["a", "b"], format: "email" },
    });
    const root = result.model.data.root as ScalarDataNode;
    expect(root.kind).toBe("scalar");
    expect(root.valueType).toBe("string");
    expect(root.enum).toEqual(["a", "b"]);
    expect(root.format).toBe("email");
    expect(result.model.ui.fields.get("")?.widget).toBe("select");
  });

  test("combines allOf objects and keeps first-effective property order", () => {
    const result = compileForm({
      schema: {
        allOf: [
          { type: "object", properties: { a: { type: "string" }, shared: { type: "string" } }, required: ["a"] },
          { type: "object", properties: { b: { type: "number" }, shared: { minLength: 1 } } },
        ],
      },
    });
    const root = result.model.data.root as ObjectDataNode;
    expect(root.properties.map((edge) => edge.name)).toEqual(["a", "shared", "b"]);
    expect(root.properties[0]?.required).toBe("required");
    expect(root.properties[1]?.required).toBe("optional");
  });

  test("forms a Union when the same path has conflicting branch types", () => {
    const result = compileForm({
      schema: {
        oneOf: [
          { type: "object", properties: { value: { type: "string" } } },
          { type: "object", properties: { value: { type: "number" } } },
        ],
      },
      uiSchema: {
        fields: { value: { field: false } },
      },
    });
    const value = result.model.data.nodes.get("value");
    expect(value?.kind).toBe("union");
    const union = value as UnionDataNode;
    expect(union.variants.map((variant) => (variant.kind === "scalar" ? variant.valueType : variant.kind)).sort()).toEqual(
      ["number", "string"],
    );
  });

  test("reports undetermined structural combinations without dropping branches", () => {
    const result = compileForm({
      schema: {
        type: "object",
        patternProperties: {
          "^x-": { type: "string" },
        },
        properties: {
          name: { type: "string" },
        },
      },
    });
    expect(result.model.data.nodes.has("name")).toBe(true);
    expect(result.diagnostics.some((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.GENERATION_UNSUPPORTED)).toBe(
      true,
    );
  });

  test("keeps conditional candidate properties in a static superset", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: { kind: { type: "string" } },
        if: { properties: { kind: { const: "company" } } },
        then: { properties: { companyName: { type: "string" } }, required: ["companyName"] },
        else: { properties: { personalName: { type: "string" } } },
      },
    });
    const root = result.model.data.root as ObjectDataNode;
    const company = root.properties.find((edge) => edge.name === "companyName");
    const personal = root.properties.find((edge) => edge.name === "personalName");
    expect(company?.required).toBe("conditional");
    expect(personal?.required).toBe("conditional");
    expect(result.model.data.nodes.has("companyName")).toBe(true);
    expect(result.model.data.nodes.has("personalName")).toBe(true);
    expect(result.model).not.toHaveProperty("active");
  });
});
