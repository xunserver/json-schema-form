import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "../../index.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import {
  createSelector,
  currentBindingSelector,
  getRenderScope,
  getRuntimeSnapshot,
  subscribeRuntime,
} from "../index.js";
import { expectRuntimeError } from "../runtime.test-utils.js";
import { peekFormRuntime } from "../test-harness.js";

function compileNested() {
  return compileForm(
    defineForm({
      schema: {
        type: "object",
        properties: {
          products: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                lines: {
                  type: "array",
                  items: { type: "object", properties: { sku: { type: "string" } } },
                },
              },
            },
          },
          pair: {
            type: "array",
            prefixItems: [{ type: "string" }, { type: "number" }],
          },
        },
      },
    }),
  ).model;
}

describe("InstanceBinding projection", () => {
  test("publishes node identity, chain, and current path without RuntimeNodeId", () => {
    const model = compileNested();
    const form = createForm(model, {
      initialValues: {
        products: [
          { name: "A", lines: [{ sku: "1" }, { sku: "2" }] },
          { name: "B", lines: [] },
        ],
        pair: ["x", 1],
      },
    });
    const sku = getRuntimeSnapshot(form, currentBindingSelector("products[0].lines[1].sku"));
    expect(sku.modelPath).toBe("products[].lines[].sku");
    expect(sku.path).toBe("products[0].lines[1].sku");
    expect(sku.itemChain).toHaveLength(2);
    expect(sku.itemId).toBe(sku.itemChain[1]);
    expect(sku.stale).toBe(false);
    expect(sku.nodeId).toContain("data:");
    expect(JSON.stringify(sku)).not.toMatch(/"rn:|RuntimeNodeId/);
    const tuple = getRuntimeSnapshot(form, currentBindingSelector("pair[1]"));
    expect(tuple.modelPath).toBe("pair[#1]");
    const recursive = compileForm(
      defineForm({
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
      }),
    ).model;
    const tree = createForm(recursive, {
      initialValues: { name: "root", children: [{ name: "child", children: [] }] },
    });
    const child = getRuntimeSnapshot(tree, currentBindingSelector("children[0].name"));
    expect(child.path).toBe("children[0].name");
    expect(child.itemChain).toHaveLength(1);
    expect(child.stale).toBe(false);
    expect(tree.model.data.nodes.has(child.modelPath)).toBe(true);
  });
});

describe("RenderScope", () => {
  test("root scope is never stale and has an empty item chain", () => {
    const form = createForm(compileNested(), { initialValues: { products: [{ name: "A", lines: [] }] } });
    const root = getRenderScope(form);
    expect(root.binding.path).toBe("");
    expect(root.binding.itemChain).toEqual([]);
    expect(root.binding.stale).toBe(false);
    const fromScope = getRenderScope(form.scope(""));
    expect(fromScope.binding.path).toBe("");
    expect(Object.isFrozen(root)).toBe(true);
  });

  test("resolves relative and absolute ModelPath to the current InstancePath", () => {
    const form = createForm(compileNested(), {
      initialValues: { products: [{ name: "A", lines: [] }, { name: "B", lines: [] }, { name: "C", lines: [] }] },
    });
    const id = form.array("products").items()[2]!.id;
    const scope = getRenderScope(form.array("products").item(id));
    expect(scope.resolve("products[].name")).toBe("products[2].name");
    expect(scope.resolve("name")).toBe("products[2].name");
    const error = expectRuntimeError(() => scope.resolve("products[2].name"));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.INVALID_PATH);
    const before = form.getValues();
    const version = form.getState().version;
    expect(scope.resolve("name")).toBe("products[2].name");
    expect(form.getValues()).toBe(before);
    expect(form.getState().version).toBe(version);
  });

  test("move updates the current path while keeping the item chain", () => {
    const form = createForm(compileNested(), {
      initialValues: { products: [{ name: "A", lines: [] }, { name: "B", lines: [] }, { name: "C", lines: [] }] },
    });
    const id = form.array("products").items()[2]!.id;
    const scope = getRenderScope(form.array("products").item(2));
    const chain = scope.binding.itemChain;
    form.array("products").move(2, 0);
    expect(scope.binding.itemChain).toEqual(chain);
    expect(scope.binding.stale).toBe(false);
    expect(scope.binding.path).toBe("products[0]");
    expect(scope.binding.itemId).toBe(id);
  });

  test("remove replace clear and reset make the scope permanently stale", () => {
    const model = compileNested();
    for (const run of ["remove", "replace", "clear", "reset"] as const) {
      const form = createForm(model, { initialValues: { products: [{ name: "A", lines: [] }, { name: "B", lines: [] }] } });
      const scope = getRenderScope(form.array("products").item(0));
      const chain = scope.binding.itemChain;
      if (run === "remove") {
        form.array("products").remove(0);
      } else if (run === "replace") {
        form.array("products").replaceItem(0, { name: "Z", lines: [] });
      } else if (run === "clear") {
        form.array("products").clear();
      } else {
        form.reset();
      }
      expect(scope.binding.stale).toBe(true);
      expect(scope.binding.itemChain).toEqual(chain);
      const error = expectRuntimeError(() => scope.resolve("name"));
      expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.STALE_SCOPE);
      expect(error.diagnostics[0]?.source).toBe("runtime");
      if (run === "remove" || run === "replace") {
        const fresh = getRenderScope(form.array("products").item(0));
        expect(fresh.binding.stale).toBe(false);
        expect(fresh.binding.itemChain).not.toEqual(chain);
      }
    }
  });

  test("rejects combining a scope with another FormInstance", () => {
    const model = compileNested();
    const first = createForm(model, { initialValues: { products: [{ name: "A", lines: [] }] } });
    const second = createForm(model, { initialValues: { products: [{ name: "B", lines: [] }] } });
    const foreign = first.array("products").items()[0]!.id;
    const scope = getRenderScope(second);
    const values = second.getValues();
    const version = second.getState().version;
    const error = expectRuntimeError(() => scope.item(foreign, "products"));
    expect(error.diagnostics[0]?.source).toBe("runtime");
    expect(second.getValues()).toBe(values);
    expect(second.getState().version).toBe(version);
  });

  test("sibling mutations do not re-evaluate a binding selector and returned objects stay frozen", () => {
    const form = createForm(compileNested(), {
      initialValues: { products: [{ name: "A", lines: [] }, { name: "B", lines: [] }] },
    });
    let runs = 0;
    subscribeRuntime(
      form,
      createSelector([currentBindingSelector("products[0]")], (binding) => {
        runs += 1;
        return binding;
      }),
      () => undefined,
    );
    runs = 0;
    form.array("products").append({ name: "C", lines: [] });
    expect(runs).toBe(0);
    const binding = getRuntimeSnapshot(form, currentBindingSelector("products[0]"));
    const scope = getRenderScope(form.array("products").item(0));
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(scope)).toBe(true);
    expect(Object.isFrozen(binding.itemChain)).toBe(true);
    expect(scope).not.toHaveProperty("setValue");
    expect(() => {
      (binding as { stale: boolean }).stale = true;
    }).toThrow();
    peekFormRuntime(form);
  });
});
