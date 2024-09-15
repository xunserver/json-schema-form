import { describe, expect, test } from "vitest";
import { defineForm } from "./define-form.js";
import { createFormEnvironment } from "../extension/create-form-environment.js";

describe("defineForm", () => {
  test("returns the same definition identity without compiling or installing", () => {
    const definition = {
      schema: { type: "object" as const },
      uiSchema: { fields: { name: { widget: "text" } } },
    };

    const authored = defineForm(definition);

    expect(authored).toBe(definition);
    expect(authored.schema).toBe(definition.schema);
    expect(authored.uiSchema).toBe(definition.uiSchema);
    expect("model" in authored).toBe(false);
    expect(createFormEnvironment().widgets.has("name")).toBe(false);
  });

  test("repeated calls do not share newly created state", () => {
    const first = defineForm({ schema: { type: "string" } });
    const second = defineForm({ schema: { type: "string" } });

    expect(first).not.toBe(second);
    expect(first.schema).not.toBe(second.schema);
  });
});
