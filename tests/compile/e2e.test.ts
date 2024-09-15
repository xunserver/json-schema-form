import { describe, expect, test } from "vitest";
import { compileForm } from "../../packages/core/src/compiler/compile-form.js";
import { CompileError } from "../../packages/core/src/model/compile-error.js";
import { createFormEnvironment } from "../../packages/core/src/extension/create-form-environment.js";
import { definePlugin } from "../../packages/core/src/extension/plugin.js";
import type { ObjectView } from "../../packages/core/src/model/ui.js";

describe("compileForm end-to-end fixtures", () => {
  test("compiles nested Draft 2020-12 object/array/scalar with default layout", () => {
    const first = compileForm(NESTED);
    const second = compileForm(NESTED);
    expect(first.model.data.nodes.get("products[].name")?.kind).toBe("scalar");
    expect(first.model.ui.viewTree.kind).toBe("object");
    expect(inspect(first)).toEqual(inspect(second));
  });

  test("compiles shared and recursive references", () => {
    const shared = compileForm(SHARED);
    expect(shared.model.data.nodes.get("home.street")?.id).not.toBe(
      shared.model.data.nodes.get("office.street")?.id,
    );
    const recursive = compileForm(RECURSIVE);
    expect(recursive.model.data.nodes.get("children[]")?.kind).toBe("recursive-ref");
    expect(inspect(recursive)).toEqual(inspect(compileForm(RECURSIVE)));
  });

  test("compiles conditional static supersets", () => {
    const result = compileForm(CONDITIONAL);
    expect(result.model.data.nodes.has("companyName")).toBe(true);
    expect(result.model.data.nodes.has("personalName")).toBe(true);
  });

  test("compiles explicit layout, native options, and widget diagnostics", () => {
    const layout = compileForm(EXPLICIT_LAYOUT);
    expect((layout.model.ui.viewTree as ObjectView).kind === "layout" || layout.model.ui.viewTree.kind === "layout").toBe(
      true,
    );
    expect(JSON.stringify(layout.model.ui.viewTree)).not.toContain("remaining-fields");

    const withNative = compileForm(NATIVE);
    expect(withNative.model.ui.fields.get("name")?.native?.mui).toEqual({ size: "small" });

    expect(() => compileForm(BAD_WIDGET)).toThrow(CompileError);
  });

  test("does not read a global widget registry", () => {
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "only-here",
          dependsOn: ["core"],
          contributes: {
            widgets: {
              sku: {
                name: "sku",
                valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
              },
            },
          },
        }),
      ],
    });
    const result = compileForm(
      {
        schema: { type: "object", properties: { code: { type: "string" } } },
        uiSchema: { fields: { code: { widget: "sku" } } },
      },
      { environment },
    );
    expect(result.model.ui.fields.get("code")?.widget).toBe("sku");
    expect(() =>
      compileForm({
        schema: { type: "object", properties: { code: { type: "string" } } },
        uiSchema: { fields: { code: { widget: "sku" } } },
      }),
    ).toThrow(CompileError);
  });
});

const NESTED = {
  schema: {
    type: "object" as const,
    properties: {
      title: { type: "string" as const },
      products: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: { name: { type: "string" as const } },
        },
      },
    },
  },
};

const SHARED = {
  schema: {
    type: "object" as const,
    properties: {
      home: { $ref: "#/$defs/address" },
      office: { $ref: "#/$defs/address" },
    },
    $defs: {
      address: {
        type: "object" as const,
        properties: { street: { type: "string" as const } },
      },
    },
  },
};

const RECURSIVE = {
  schema: {
    $ref: "#/$defs/node",
    $defs: {
      node: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          children: { type: "array" as const, items: { $ref: "#/$defs/node" } },
        },
      },
    },
  },
};

const CONDITIONAL = {
  schema: {
    type: "object" as const,
    properties: { kind: { type: "string" as const } },
    if: { properties: { kind: { const: "company" } } },
    then: { properties: { companyName: { type: "string" as const } } },
    else: { properties: { personalName: { type: "string" as const } } },
  },
};

const EXPLICIT_LAYOUT = {
  schema: {
    type: "object" as const,
    properties: {
      first: { type: "string" as const },
      second: { type: "string" as const },
    },
  },
  uiSchema: {
    layout: {
      type: "layout" as const,
      children: [
        { type: "field" as const, path: "first" },
        { type: "remaining-fields" as const },
      ],
    },
  },
};

const NATIVE = {
  schema: { type: "object" as const, properties: { name: { type: "string" as const } } },
  uiSchema: { fields: { name: { native: { mui: { size: "small" } } } } },
};

const BAD_WIDGET = {
  schema: { type: "object" as const, properties: { name: { type: "string" as const } } },
  uiSchema: { fields: { name: { widget: "does-not-exist" } } },
};

function inspect(result: ReturnType<typeof compileForm>) {
  return {
    nodes: [...result.model.data.nodes.entries()].map(([path, node]) => [path, node.id, node.kind]),
    fields: [...result.model.ui.fields.entries()].map(([path, field]) => [path, field.widget]),
    view: result.model.ui.viewTree,
    diagnostics: result.diagnostics.map((item) => [item.code, item.schemaPath, item.modelPath]),
  };
}
