import { describe, expect, test } from "vitest";
import { compileForm } from "./compile-form.js";
import { CompileError } from "../model/compile-error.js";
import { createFormEnvironment } from "../extension/create-form-environment.js";
import { definePlugin } from "../extension/plugin.js";
import { defineForm } from "../definition/define-form.js";

describe("compileForm", () => {
  test("uses the default environment when none is provided", () => {
    const result = compileForm(
      defineForm({
        schema: { type: "object", properties: { title: { type: "string" } } },
      }),
    );
    expect(result.model).toBeDefined();
    expect(result.model.ui.fields.get("title")?.widget).toBe("text");
    expect(result.model.rule.rules).toEqual([]);
    expect(result.model.validation.validators).toEqual([]);
    expect(result.model.schemaDynamics.activations).toEqual([]);
  });

  test("uses an explicit environment without mutating it", () => {
    const plugin = definePlugin({
      id: "biz",
      dependsOn: ["core"],
      contributes: {
        widgets: {
          sku: {
            name: "sku",
            valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
            interaction: { setValue: true },
            matchers: [{ schemaTypes: ["string"], priority: 80 }],
          },
        },
      },
    });
    const environment = createFormEnvironment({ plugins: [plugin] });
    const before = [...environment.widgets.keys()];
    const result = compileForm(
      {
        schema: { type: "object", properties: { code: { type: "string" } } },
        uiSchema: { fields: { code: { widget: "sku" } } },
      },
      { environment },
    );
    expect(result.model.ui.fields.get("code")?.widget).toBe("sku");
    expect([...environment.widgets.keys()]).toEqual(before);
    expect(environment.widgets.has("sku")).toBe(true);
  });

  test("does not mutate the input definition", () => {
    const definition = {
      schema: {
        type: "object" as const,
        properties: { name: { type: "string" as const } },
      },
    };
    const result = compileForm(definition);
    expect(definition.schema.properties.name.type).toBe("string");
    expect(Object.isFrozen(definition)).toBe(false);
    expect(result.model).not.toHaveProperty("instance");
  });

  test("aggregates independent UI errors and never returns a partial model", () => {
    let thrown: unknown;
    try {
      compileForm({
        schema: { type: "object", properties: { name: { type: "string" } } },
        uiSchema: {
          fields: {
            missing: { widget: "text" },
            name: { widget: "not-registered" },
          },
        },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CompileError);
    const error = thrown as CompileError;
    expect(error.diagnostics).toHaveLength(2);
    expect(error).not.toHaveProperty("model");
    expect(Object.isFrozen(error.diagnostics)).toBe(true);
  });
});
