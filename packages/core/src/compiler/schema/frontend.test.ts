import { describe, expect, test } from "vitest";
import { SCHEMA_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import { runSchemaFrontend } from "./frontend.js";

describe("Schema Frontend", () => {
  test("treats a missing $schema as Draft 2020-12", () => {
    const result = runSchemaFrontend({
      type: "object",
      properties: {
        name: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
    });
    expect(result.diagnostics.hasErrors()).toBe(false);
    expect(result.graph?.dialect).toBe("draft-2020-12");
    expect(result.diagnostics.snapshot().some((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.INVALID_DIALECT)).toBe(
      false,
    );
  });

  test("accepts boolean schemas and canonical dialect URIs", () => {
    for (const schema of [
      true,
      false,
      { $schema: "https://json-schema.org/draft/2020-12/schema", type: "string" },
      { $schema: "https://json-schema.org/draft/2020-12/schema#", type: "number" },
    ]) {
      const result = runSchemaFrontend(schema as never);
      expect(result.diagnostics.hasErrors(), JSON.stringify(schema)).toBe(false);
    }
  });

  test("rejects unsupported dialects with a SchemaPath", () => {
    const result = runSchemaFrontend({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "string",
    });
    const diagnostic = result.diagnostics.snapshot().find((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.INVALID_DIALECT);
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.schemaPath).toBe("#/$schema");
    expect(result.graph).toBeUndefined();
  });

  test.each([
    [{ required: "name" }, "required"],
    [{ properties: ["name"] }, "properties"],
    [{ items: [{ type: "string" }] }, "items"],
    [{ prefixItems: { type: "string" } }, "prefixItems"],
    [{ allOf: { type: "string" } }, "allOf"],
    [{ type: "foo" }, "type"],
  ])("rejects malformed keyword %j", (schema, keyword) => {
    const result = runSchemaFrontend(schema as never);
    const diagnostic = result.diagnostics
      .snapshot()
      .find((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.INVALID_KEYWORD);
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.schemaPath).toBe(`#/${keyword}`);
    expect(diagnostic?.metadata).toMatchObject({ keyword });
  });

  test("keeps shared $defs targets as one graph node", () => {
    const result = runSchemaFrontend({
      type: "object",
      properties: {
        billingAddress: { $ref: "#/$defs/address" },
        shippingAddress: { $ref: "#/$defs/address" },
      },
      $defs: {
        address: { type: "object", properties: { street: { type: "string" } } },
      },
    });
    expect(result.graph).toBeDefined();
    const billing = [...result.graph!.nodes.values()].find((node) => node.schemaPath === "#/properties/billingAddress");
    const shipping = [...result.graph!.nodes.values()].find((node) => node.schemaPath === "#/properties/shippingAddress");
    expect(billing?.ref?.targetId).toBeDefined();
    expect(billing?.ref?.targetId).toBe(shipping?.ref?.targetId);
  });

  test("preserves $ref siblings instead of dropping them", () => {
    const result = runSchemaFrontend({
      $ref: "#/$defs/address",
      title: "Shipping",
      $defs: { address: { type: "object" } },
    });
    const root = result.graph?.nodes.get(result.graph.rootId);
    expect(root?.ref?.targetId).toBeDefined();
    expect(typeof root?.schema === "object" && root.schema !== true && "title" in root.schema).toBe(true);
    expect((root?.schema as { title?: string }).title).toBe("Shipping");
  });

  test("records self-cycles and unresolved external refs", () => {
    const cyclic = runSchemaFrontend({
      $defs: {
        node: {
          type: "object",
          properties: { next: { $ref: "#/$defs/node" } },
        },
      },
      $ref: "#/$defs/node",
    });
    const next = [...cyclic.graph!.nodes.values()].find((node) => node.schemaPath === "#/$defs/node/properties/next");
    expect(next?.ref?.cycle).toBe(true);

    const external = runSchemaFrontend({ $ref: "https://example.com/geo.json" });
    const diagnostic = external.diagnostics
      .snapshot()
      .find((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.UNRESOLVED_REF);
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.schemaPath).toBe("#/$ref");
  });

  test("warns on undeclared x-* keywords without treating them as UI protocol", () => {
    const result = runSchemaFrontend({ type: "string", "x-ui": { widget: "magic" } });
    const diagnostic = result.diagnostics
      .snapshot()
      .find((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.UNSUPPORTED_EXTENSION);
    expect(diagnostic?.severity).toBe("warning");
    expect(diagnostic?.schemaPath).toBe("#/x-ui");
    expect(result.diagnostics.hasErrors()).toBe(false);
  });

  test("does not guess a static target for $dynamicRef", () => {
    const result = runSchemaFrontend({
      $dynamicAnchor: "item",
      $dynamicRef: "#item",
      type: "object",
    });
    const diagnostic = result.diagnostics
      .snapshot()
      .find((item) => item.code === SCHEMA_DIAGNOSTIC_CODES.GENERATION_UNSUPPORTED);
    expect(diagnostic?.schemaPath).toBe("#/$dynamicRef");
    expect(diagnostic?.severity).toBe("warning");
  });

  test("does not inline boolean and applicator children into a forged schema", () => {
    const result = runSchemaFrontend({
      allOf: [true, { type: "object", properties: { name: { type: "string" } } }],
      if: true,
      then: { required: ["name"] },
    });
    const root = result.graph!.nodes.get(result.graph!.rootId)!;
    expect(Object.keys(root.childIds).some((key) => key.startsWith("allOf/"))).toBe(true);
    expect(root.childIds.if).toBeDefined();
    expect(root.childIds.then).toBeDefined();
    expect(typeof root.schema === "object" && !Array.isArray(root.schema)).toBe(true);
  });

  test("resolves nested $id, escaped pointers, and $anchor", () => {
    const result = runSchemaFrontend({
      $id: "https://example.com/root",
      properties: {
        nested: {
          $id: "nested",
          type: "object",
          properties: {
            value: { $ref: "#cell" },
          },
          $defs: {
            inner: { $anchor: "cell", type: "number" },
          },
        },
        escaped: { $ref: "#/$defs/a~1b" },
      },
      $defs: {
        "a/b": { type: "boolean" },
      },
    });
    expect(result.diagnostics.hasErrors()).toBe(false);
    const escaped = [...result.graph!.nodes.values()].find((node) => node.schemaPath === "#/properties/escaped");
    expect(escaped?.ref?.unresolved).toBe(false);
    const nestedValue = [...result.graph!.nodes.values()].find(
      (node) => node.schemaPath === "#/properties/nested/properties/value",
    );
    expect(nestedValue?.ref?.unresolved).toBe(false);
  });
});
