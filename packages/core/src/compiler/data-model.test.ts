import { describe, expect, test } from "vitest";
import { compileForm } from "./compile-form.js";
import type { ObjectDataNode, RecursiveDataRef } from "../model/data.js";

const ADDRESS = {
  type: "object" as const,
  properties: {
    street: { type: "string" as const },
    city: { type: "string" as const },
  },
};

describe("DataModel compiler", () => {
  test("instantiates shared schema targets at distinct ModelPaths and DataNodeIds", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: {
          billingAddress: { $ref: "#/$defs/address" },
          shippingAddress: { $ref: "#/$defs/address" },
        },
        $defs: { address: ADDRESS },
      },
    });
    const billing = result.model.data.nodes.get("billingAddress");
    const shipping = result.model.data.nodes.get("shippingAddress");
    expect(billing?.path).toBe("billingAddress");
    expect(shipping?.path).toBe("shippingAddress");
    expect(billing?.id).not.toBe(shipping?.id);
    expect(billing?.schemaRef).toBe(shipping?.schemaRef);
    expect(billing?.id).not.toBe(billing?.path);
  });

  test("places required state on object edges, not child nodes", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
      },
    });
    const root = result.model.data.root as ObjectDataNode;
    expect(root.properties.map((edge) => edge.name)).toEqual(["name", "age"]);
    expect(root.properties[0]?.required).toBe("required");
    expect(root.properties[1]?.required).toBe("optional");
    expect(result.model.data.nodes.get("name")).not.toHaveProperty("required");
  });

  test("compiles list templates without InstancePath nodes or ArrayItemId sidecars", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: {
          products: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" } },
            },
          },
        },
      },
    });
    expect(result.model.data.nodes.get("products[]")?.kind).toBe("object");
    expect(result.model.data.nodes.get("products[].name")?.kind).toBe("scalar");
    expect(result.model.data.nodes.has("products[0]" as never)).toBe(false);
    expect(result.model).not.toHaveProperty("arrayItems");
    expect(JSON.stringify(result.model.data)).not.toMatch(/ArrayItemId/);
  });

  test("compiles recursive refs as a finite tree and does not truncate sibling shares", () => {
    const recursive = compileForm({
      schema: {
        $ref: "#/$defs/category",
        $defs: {
          category: {
            type: "object",
            properties: {
              name: { type: "string" },
              children: { type: "array", items: { $ref: "#/$defs/category" } },
            },
          },
        },
      },
    });
    const item = recursive.model.data.nodes.get("children[]") as RecursiveDataRef;
    expect(item.kind).toBe("recursive-ref");
    expect(item.targetId).toBe(recursive.model.data.root.id);
    expect([...recursive.model.data.nodes.keys()].length).toBeGreaterThan(0);
    expect([...recursive.model.data.nodes.values()].filter((node) => node.kind === "recursive-ref")).toHaveLength(1);

    const shared = compileForm({
      schema: {
        type: "object",
        properties: {
          home: { $ref: "#/$defs/address" },
          office: { $ref: "#/$defs/address" },
        },
        $defs: { address: ADDRESS },
      },
    });
    expect(shared.model.data.nodes.get("home")?.kind).toBe("object");
    expect(shared.model.data.nodes.get("office")?.kind).toBe("object");
    expect(shared.model.data.nodes.get("home.street")?.kind).toBe("scalar");
    expect(shared.model.data.nodes.get("office.street")?.kind).toBe("scalar");
  });

  test("is frozen and contains no runtime state", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    });
    expect(Object.isFrozen(result.model.data)).toBe(true);
    expect(Object.isFrozen(result.model.data.root)).toBe(true);
    expect(Object.isFrozen(result.model.diagnostics)).toBe(true);
    expect("set" in result.model.data.nodes).toBe(false);
    expect(result.model.data).not.toHaveProperty("values");
    expect(result.model).not.toHaveProperty("values");
    expect(result.model).not.toHaveProperty("touched");
    expect(JSON.stringify(result.model)).not.toMatch(/InstancePath|transaction|arrayItemId/i);
    expect(() => {
      (result.model.data.root as { kind: string }).kind = "scalar";
    }).toThrow();
  });

  test("repeated compilation is structurally stable", () => {
    const definition = {
      schema: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
        },
      },
    };
    const first = compileForm(definition);
    const second = compileForm(definition);
    expect([...first.model.data.nodes.keys()]).toEqual([...second.model.data.nodes.keys()]);
    expect([...first.model.data.nodes.values()].map((node) => node.id)).toEqual(
      [...second.model.data.nodes.values()].map((node) => node.id),
    );
    expect(first.diagnostics.map((item) => item.code)).toEqual(second.diagnostics.map((item) => item.code));
  });
});
