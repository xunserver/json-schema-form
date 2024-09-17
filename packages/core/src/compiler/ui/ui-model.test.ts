import { describe, expect, test } from "vitest";
import { compileForm } from "../compile-form.js";
import { CompileError } from "../../model/compile-error.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import { createFormEnvironment } from "../../extension/create-form-environment.js";
import { definePlugin } from "../../extension/plugin.js";
import type { ArrayView, FieldView, GroupView, ObjectView } from "../../model/ui/ui.js";

describe("UIModel compiler", () => {
  test("projects scalars as fields and keeps object/array containers", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: {
            type: "object",
            properties: { street: { type: "string" } },
          },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    });
    expect(result.model.ui.fields.has("name")).toBe(true);
    expect(result.model.ui.fields.has("address")).toBe(false);
    expect(result.model.ui.fields.has("tags")).toBe(false);
    expect(result.model.ui.fields.has("address.street")).toBe(true);
    expect(result.model.ui.viewTree.kind).toBe("object");
  });

  test("treats field:false as exclusion and visible:false as retained policy", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: {
          hiddenByDefinition: { type: "string" },
          temporarilyHidden: { type: "string" },
        },
      },
      uiSchema: {
        fields: {
          hiddenByDefinition: { field: false },
          temporarilyHidden: { behavior: { visible: false } },
        },
      },
    });
    expect(result.model.ui.fields.has("hiddenByDefinition")).toBe(false);
    const hidden = result.model.ui.fields.get("temporarilyHidden");
    expect(hidden?.behavior?.visible).toBe(false);
    expect(JSON.stringify(result.model.ui.viewTree)).toContain("temporarilyHidden");
    expect(JSON.stringify(result.model.ui.viewTree)).not.toContain("hiddenByDefinition");
    expect(hidden).not.toHaveProperty("effectiveVisible");
  });

  test("projects an object as an atomic field when a compatible widget is explicit", () => {
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "maps",
          dependsOn: ["core"],
          contributes: {
            widgets: {
              "address-picker": {
                name: "address-picker",
                valueContract: { jsonTypes: ["object"], canonical: "json-scalar" },
                interaction: { setValue: true },
              },
            },
          },
        }),
      ],
    });
    const result = compileForm(
      {
        schema: {
          type: "object",
          properties: {
            address: {
              type: "object",
              properties: { street: { type: "string" } },
            },
          },
        },
        uiSchema: {
          fields: {
            address: { widget: "address-picker" },
          },
        },
      },
      { environment },
    );
    expect(result.model.ui.fields.get("address")?.widget).toBe("address-picker");
    const tree = result.model.ui.viewTree as ObjectView;
    expect(tree.children[0]?.kind).toBe("field");
    expect(JSON.stringify(tree)).not.toContain("address.street");
  });

  test("lets an explicit widget beat enum matchers", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: { color: { type: "string", enum: ["red", "blue"] } },
      },
      uiSchema: {
        fields: { color: { widget: "text" } },
      },
    });
    expect(result.model.ui.fields.get("color")?.widget).toBe("text");
    expect((result.model.data.nodes.get("color") as { enum?: unknown }).enum).toEqual(["red", "blue"]);
  });

  test("resolves matcher category before priority and registry order", () => {
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "custom",
          dependsOn: ["core"],
          contributes: {
            widgets: {
              "string-fallback": {
                name: "string-fallback",
                valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
                interaction: { setValue: true },
                matchers: [{ schemaTypes: ["string"], priority: 50 }],
              },
            },
          },
        }),
      ],
    });
    const result = compileForm(
      {
        schema: {
          type: "object",
          properties: {
            color: { type: "string", enum: ["red"], format: "color" },
          },
        },
      },
      { environment },
    );
    expect(result.model.ui.fields.get("color")?.widget).toBe("select");
  });

  test("reports missing and incompatible widgets", () => {
    expect(() =>
      compileForm({
        schema: { type: "object", properties: { name: { type: "string" } } },
        uiSchema: { fields: { name: { widget: "missing-widget" } } },
      }),
    ).toThrow(CompileError);

    try {
      compileForm({
        schema: {
          type: "object",
          properties: { address: { type: "object", properties: { street: { type: "string" } } } },
        },
        uiSchema: { fields: { address: { widget: "text" } } },
      });
      throw new Error("expected CompileError");
    } catch (error) {
      expect(error).toBeInstanceOf(CompileError);
      const diagnostic = (error as CompileError).diagnostics.find(
        (item) => item.code === COMPILER_DIAGNOSTIC_CODES.WIDGET_INCOMPATIBLE,
      );
      expect(diagnostic?.modelPath).toBe("address");
      expect(diagnostic?.metadata).toMatchObject({ widget: "text" });
    }
  });

  test("rejects missing field paths in deterministic diagnostic order", () => {
    try {
      compileForm({
        schema: { type: "object", properties: { name: { type: "string" } } },
        uiSchema: {
          fields: {
            "products[].missing": { widget: "text" },
            name: { widget: "missing-widget" },
          },
        },
      });
      throw new Error("expected CompileError");
    } catch (error) {
      expect(error).toBeInstanceOf(CompileError);
      const codes = (error as CompileError).diagnostics.map((item) => item.code);
      expect(codes).toContain(COMPILER_DIAGNOSTIC_CODES.UI_PATH_MISSING);
      expect(codes).toContain(COMPILER_DIAGNOSTIC_CODES.WIDGET_MISSING);
      expect((error as CompileError).diagnostics.every((item) => Object.isFrozen(item))).toBe(true);
    }
  });

  test("snapshots native options by adapter id and rejects reserved keys", () => {
    const result = compileForm({
      schema: { type: "object", properties: { name: { type: "string" } } },
      uiSchema: {
        fields: {
          name: {
            native: {
              "element-plus": { clearable: true },
              antd: { size: "small" },
            },
          },
        },
      },
    });
    expect(result.model.ui.fields.get("name")?.native?.["element-plus"]).toEqual({ clearable: true });
    expect(result.model.ui.fields.get("name")?.native?.antd).toEqual({ size: "small" });
    expect(Object.isFrozen(result.model.ui.fields.get("name")?.native)).toBe(true);

    try {
      compileForm({
        schema: { type: "object", properties: { name: { type: "string" } } },
        uiSchema: {
          fields: {
            name: { native: { antd: { value: "x" } } },
          },
        },
      });
      throw new Error("expected CompileError");
    } catch (error) {
      expect(error).toBeInstanceOf(CompileError);
      const diagnostic = (error as CompileError).diagnostics.find(
        (item) => item.code === COMPILER_DIAGNOSTIC_CODES.NATIVE_RESERVED_KEY,
      );
      expect(diagnostic?.modelPath).toBe("name");
      expect(diagnostic?.metadata).toMatchObject({ adapterId: "antd", key: "value" });
    }

    try {
      compileForm({
        schema: { type: "object", properties: { name: { type: "string" } } },
        uiSchema: {
          fields: {
            name: { native: { "": { size: "small" } } },
          },
        },
      });
      throw new Error("expected CompileError");
    } catch (error) {
      expect(error).toBeInstanceOf(CompileError);
      expect((error as CompileError).diagnostics.some((item) => item.code === COMPILER_DIAGNOSTIC_CODES.NATIVE_INVALID)).toBe(
        true,
      );
    }
  });

  test("builds a nested default ViewTree and stops at atomic containers", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: {
          profile: {
            type: "object",
            properties: { name: { type: "string" } },
          },
          products: {
            type: "array",
            items: {
              type: "object",
              properties: { title: { type: "string" } },
            },
          },
        },
      },
    });
    const tree = result.model.ui.viewTree as ObjectView;
    expect(tree.children.map((child) => child.kind)).toEqual(["object", "array"]);
    const products = tree.children[1] as ArrayView;
    expect(products.itemLayout[0]?.kind).toBe("object");
  });

  test("uses explicit layout as authoritative, expands remaining-fields, and isolates duplicate FieldViews", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: {
          first: { type: "string" },
          second: { type: "string" },
        },
      },
      uiSchema: {
        layout: {
          type: "layout",
          children: [
            { type: "group", children: [{ type: "field", path: "first" }] },
            { type: "group", children: [{ type: "field", path: "first" }] },
            { type: "remaining-fields" },
          ],
        },
      },
    });
    const tree = result.model.ui.viewTree;
    expect(JSON.stringify(tree)).not.toContain("remaining-fields");
    const fieldViews = collectFieldViews(tree);
    expect(fieldViews.map((view) => view.fieldPath)).toEqual(["first", "first", "second"]);
    expect(fieldViews[0]?.id).not.toBe(fieldViews[1]?.id);
  });

  test("omits unreferenced fields from an explicit layout", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: {
          first: { type: "string" },
          second: { type: "string" },
        },
      },
      uiSchema: {
        layout: {
          type: "layout",
          children: [{ type: "field", path: "first" }],
        },
      },
    });
    expect(JSON.stringify(result.model.ui.viewTree)).toContain("first");
    expect(JSON.stringify(result.model.ui.viewTree)).not.toContain("second");
  });

  test("keeps ObjectView distinct from GroupView and omits render-time state", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: {
          profile: {
            type: "object",
            properties: { name: { type: "string" } },
          },
        },
      },
      uiSchema: {
        layout: {
          type: "layout",
          children: [
            { type: "object", path: "profile", children: [{ type: "field", path: "profile.name" }] },
            { type: "group", children: [{ type: "field", path: "profile.name" }] },
          ],
        },
      },
    });
    const tree = result.model.ui.viewTree;
    const objectView = (tree as { children: Array<ObjectView | GroupView> }).children[0] as ObjectView;
    const groupView = (tree as { children: Array<ObjectView | GroupView> }).children[1] as GroupView;
    expect(objectView.kind).toBe("object");
    expect(objectView.path).toBe("profile");
    expect(groupView.kind).toBe("group");
    expect(groupView).not.toHaveProperty("path");
    expect(JSON.stringify(result.model.ui)).not.toMatch(/focused|collapsed|component|onClick|effectiveVisible/);
  });

  test("projects group title and description from explicit layout", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: { name: { type: "string" } },
      },
      uiSchema: {
        layout: {
          type: "layout",
          children: [
            {
              type: "group",
              title: "基本资料",
              description: "姓名与简介",
              children: [{ type: "field", path: "name" }],
            },
          ],
        },
      },
    });
    const tree = result.model.ui.viewTree as { children: GroupView[] };
    expect(tree.children[0]?.kind).toBe("group");
    expect(tree.children[0]?.title).toBe("基本资料");
    expect(tree.children[0]?.description).toBe("姓名与简介");
  });

  test("projects required and optional Object property sources onto FieldDescriptors", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          nickname: { type: "string" },
        },
        required: ["name"],
      },
    });
    const name = result.model.ui.fields.get("name");
    const nickname = result.model.ui.fields.get("nickname");
    expect(name?.requirement).toEqual({
      status: "required",
      ownerPath: "",
      property: "name",
      schemaRefs: ["#/properties/name"],
    });
    expect(nickname?.requirement).toEqual({
      status: "optional",
      ownerPath: "",
      property: "nickname",
      schemaRefs: ["#/properties/nickname"],
    });
    expect(name).not.toHaveProperty("required");
    expect(Object.isFrozen(name?.requirement)).toBe(true);
    expect(() => {
      (name?.requirement as { status: string }).status = "optional";
    }).toThrow();
  });

  test("keeps conditional required as Dynamics source refs without an instance boolean", () => {
    const result = compileForm({
      schema: {
        type: "object",
        properties: { kind: { type: "string" } },
        if: { properties: { kind: { const: "company" } } },
        then: { properties: { companyName: { type: "string" } }, required: ["companyName"] },
        else: { properties: { personalName: { type: "string" } } },
      },
    });
    const company = result.model.ui.fields.get("companyName");
    const personal = result.model.ui.fields.get("personalName");
    expect(company?.requirement?.status).toBe("conditional");
    expect(company?.requirement?.activationSources).toEqual(["#/then"]);
    expect(personal?.requirement?.status).toBe("conditional");
    expect(personal?.requirement?.activationSources).toEqual(["#/else"]);
    expect(company?.requirement).not.toHaveProperty("required");
    expect(JSON.stringify(company)).not.toMatch(/"required":true|"effectiveRequired"/);
    const thenBranch = result.model.schemaDynamics.plans
      .find((plan) => plan.kind === "if")
      ?.branches.find((branch) => branch.schemaPath === "#/then");
    expect(thenBranch?.schemaPath).toBe(company?.requirement?.activationSources?.[0]);
  });

  test("does not invent a required source for root or array item Fields", () => {
    const root = compileForm({ schema: { type: "string" } });
    expect(root.model.ui.fields.get("")?.requirement).toBeUndefined();

    const list = compileForm({
      schema: { type: "array", items: { type: "string" } },
    });
    expect(list.model.ui.fields.get("[]")?.requirement).toBeUndefined();
  });

  test("projects requirement for an atomic Object child from its incoming edge", () => {
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "maps",
          dependsOn: ["core"],
          contributes: {
            widgets: {
              "address-picker": {
                name: "address-picker",
                valueContract: { jsonTypes: ["object"], canonical: "json-scalar" },
                interaction: { setValue: true },
              },
            },
          },
        }),
      ],
    });
    const result = compileForm(
      {
        schema: {
          type: "object",
          properties: {
            address: {
              type: "object",
              properties: { street: { type: "string" } },
            },
          },
          required: ["address"],
        },
        uiSchema: {
          fields: {
            address: { widget: "address-picker" },
          },
        },
      },
      { environment },
    );
    expect(result.model.ui.fields.get("address")?.requirement).toMatchObject({
      status: "required",
      ownerPath: "",
      property: "address",
    });
    const tree = result.model.ui.viewTree as ObjectView;
    expect(tree.children[0]?.kind).toBe("field");
    expect(JSON.stringify(tree)).not.toContain("address.street");
  });

  test("rejects FieldUI props and native attempts to override required", () => {
    try {
      compileForm({
        schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
        uiSchema: {
          fields: {
            name: { props: { required: false } },
          },
        },
      });
      throw new Error("expected CompileError");
    } catch (error) {
      expect(error).toBeInstanceOf(CompileError);
      const diagnostic = (error as CompileError).diagnostics.find(
        (item) => item.code === COMPILER_DIAGNOSTIC_CODES.UI_RESERVED_KEY,
      );
      expect(diagnostic?.modelPath).toBe("name");
      expect(diagnostic?.metadata).toMatchObject({ key: "required", location: "props" });
    }

    try {
      compileForm({
        schema: { type: "object", properties: { name: { type: "string" } } },
        uiSchema: {
          fields: {
            name: { native: { antd: { required: true } } },
          },
        },
      });
      throw new Error("expected CompileError");
    } catch (error) {
      expect(error).toBeInstanceOf(CompileError);
      const diagnostic = (error as CompileError).diagnostics.find(
        (item) => item.code === COMPILER_DIAGNOSTIC_CODES.NATIVE_RESERVED_KEY,
      );
      expect(diagnostic?.metadata).toMatchObject({ adapterId: "antd", key: "required" });
    }
  });
});

function collectFieldViews(node: { kind: string; children?: readonly unknown[]; itemLayout?: readonly unknown[]; fieldPath?: string; id: string }): FieldView[] {
  if (node.kind === "field") {
    return [node as FieldView];
  }
  const children = [
    ...((node.children as typeof node[] | undefined) ?? []),
    ...((node.itemLayout as typeof node[] | undefined) ?? []),
  ];
  return children.flatMap((child) => collectFieldViews(child));
}
