import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "../../index.js";
import { resolveJsonPointerBinding, instancePathToJsonPointer } from "./pointer.js";
import { peekFormRuntime } from "../test-harness.js";

describe("JSON Pointer mapping", () => {
  test("maps object, escaped property, array index and required missingProperty", () => {
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            profile: {
              type: "object",
              properties: {
                name: { type: "string" },
                "a/b": { type: "string" },
              },
            },
            items: {
              type: "array",
              items: { type: "object", properties: { sku: { type: "string" } } },
            },
          },
        },
      }),
    );
    const form = createForm(model, {
      initialValues: { profile: { name: "Ada", "a/b": "x" }, items: [{ sku: "s" }] },
    });
    const runtime = peekFormRuntime(form);
    expect(resolveJsonPointerBinding("/profile/name", runtime.bindings, model)?.path).toBe("profile.name");
    expect(resolveJsonPointerBinding("/profile/a~1b", runtime.bindings, model)?.path).toBe('profile["a/b"]');
    expect(resolveJsonPointerBinding("/items/0/sku", runtime.bindings, model)?.path).toBe("items[0].sku");
    expect(resolveJsonPointerBinding("/profile", runtime.bindings, model, "name")?.path).toBe("profile.name");
    expect(instancePathToJsonPointer("profile.name")).toBe("/profile/name");
    expect(instancePathToJsonPointer('profile["a/b"]')).toBe("/profile/a~1b");
    expect(instancePathToJsonPointer("items[0].sku")).toBe("/items/0/sku");
  });
});
