import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "../../index.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import {
  arrayOrderSelector,
  createSelector,
  getRuntimeSnapshot,
  itemPathSelector,
  itemValueSelector,
  subscribeRuntime,
} from "../index.js";
import { createFormWithTestHooks, peekFormRuntime } from "../test-harness.js";
import { expectRuntimeError } from "../runtime.test-utils.js";
import type { JsonValue } from "../form/contracts.js";

function compileList() {
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

describe("array identity sidecar", () => {
  test("materializes unique ids without writing them into values or the model", () => {
    const model = compileList();
    const frozen = model.data;
    const form = createForm(model, {
      initialValues: {
        products: [
          { name: "A", lines: [{ sku: "1" }, { sku: "2" }] },
          { name: "B", lines: [] },
        ],
      },
    });
    const items = form.array("products").items();
    expect(items.map((item) => item.path)).toEqual(["products[0]", "products[1]"]);
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
    expect(JSON.stringify(form.getValues())).not.toMatch(/f\d+:/);
    expect(form.getValues()).not.toHaveProperty("id");
    expect(model.data).toBe(frozen);
    const nested = form.array("products").item(0).array("lines").items();
    expect(nested).toHaveLength(2);
    expect(nested[0]?.path).toBe("products[0].lines[0]");
  });

  test("scopes recursive children without growing the compiled model", () => {
    const { model } = compileForm(
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
    );
    const nodeCount = [...model.data.nodes.keys()].length;
    const form = createForm(model, {
      initialValues: { name: "root", children: [{ name: "child", children: [{ name: "leaf", children: [] }] }] },
    });
    const child = form.array("children").item(0);
    expect(child.getValue("name")).toBe("child");
    expect(child.array("children").item(0).getValue("name")).toBe("leaf");
    expect([...form.model.data.nodes.keys()].length).toBe(nodeCount);
  });

  test("isolates identity state across instances of the same model", () => {
    const model = compileList();
    const first = createForm(model, { initialValues: { products: [{ name: "A" }] } });
    const second = createForm(model, { initialValues: { products: [{ name: "A" }] } });
    const id = first.array("products").items()[0]!.id;
    const error = expectRuntimeError(() => second.array("products").item(id));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_ARRAY_ITEM);
    expect(first.array("products").items()[0]!.id).not.toBe(second.array("products").items()[0]!.id);
  });

  test("failed draft does not expose a tentative id", () => {
    const form = createFormWithTestHooks(
      compileList(),
      { initialValues: { products: [{ name: "A" }] } },
      {
        phases: {
          syncValidation: () => {
            throw new Error("boom");
          },
        },
      },
    );
    const before = form.array("products").items().map((item) => item.id);
    expectRuntimeError(() => form.array("products").append({ name: "B" }));
    expect(form.array("products").items().map((item) => item.id)).toEqual(before);
    expect(form.getState().version).toBe(0);
  });
});

describe("array commands", () => {
  test("append insert move remove replace clear stay atomic", () => {
    const form = createForm(compileList(), { initialValues: { products: [{ name: "A" }, { name: "B" }] } });
    const products = form.array("products");
    const firstId = products.items()[0]!.id;
    const appended = products.append({ name: "C", lines: [{ sku: "x" }] });
    expect(form.getState().version).toBe(1);
    expect(products.items().map((item) => item.value)).toEqual([
      { name: "A" },
      { name: "B" },
      { name: "C", lines: [{ sku: "x" }] },
    ]);
    const inserted = products.insert(1, { name: "D" });
    expect(products.items().map((item) => item.id)).toEqual([firstId, inserted, products.items()[2]!.id, appended]);
    products.move(firstId, 2);
    expect(products.items()[2]!.id).toBe(firstId);
    expect(form.scope(`products[2]`).getValue("name")).toBe("A");
    products.setItemValue(firstId, { name: "A2" });
    expect(products.items().find((item) => item.id === firstId)?.id).toBe(firstId);
    const replaced = products.replaceItem(1, { name: "Z" });
    expect(replaced).not.toBe(inserted);
    products.remove(appended);
    products.clear();
    expect(form.getValue("products")).toEqual([]);
    expect(form.getState().version).toBeGreaterThan(0);
  });

  test("rejects tuple structure commands and illegal refs without mutation", () => {
    const form = createForm(compileList(), {
      initialValues: { products: [{ name: "A" }], pair: ["x", 1] },
    });
    const snapshot = form.getState();
    const tuple = expectRuntimeError(() => form.array("pair").append("y"));
    expect(tuple.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.ARRAY_SHAPE_UNSUPPORTED);
    const oob = expectRuntimeError(() => form.array("products").remove(3));
    expect(oob.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.ARRAY_INDEX_OUT_OF_RANGE);
    expect(form.getState()).toBe(snapshot);
  });
});

describe("replacement, reset, and resolver", () => {
  test("default whole-array replacement rebuilds ids while equal values stay no-op", () => {
    const form = createForm(compileList(), { initialValues: { products: [{ name: "A" }] } });
    const oldId = form.array("products").items()[0]!.id;
    const snapshot = form.getState();
    form.setValue("products", [{ name: "A" }]);
    expect(form.getState()).toBe(snapshot);
    expect(form.array("products").items()[0]!.id).toBe(oldId);
    form.setValue("products", [{ name: "B" }]);
    expect(form.array("products").items()[0]!.id).not.toBe(oldId);
  });

  test("resolver keeps unique business keys and rolls back duplicates", () => {
    const form = createForm(compileList(), {
      initialValues: { products: [{ name: "A" }, { name: "B" }] },
      arrayIdentityResolvers: [
        {
          path: "products",
          resolve: (item) => (typeof item === "object" && item !== null && "name" in item ? String(item.name) : undefined),
        },
      ],
    });
    const [first, second] = form.array("products").items();
    form.setValue("products", [{ name: "B" }, { name: "A" }, { name: "C" }]);
    const next = form.array("products").items();
    expect(next[0]!.id).toBe(second!.id);
    expect(next[1]!.id).toBe(first!.id);
    expect(next[2]!.id).not.toBe(first!.id);
    const before = form.getValues();
    const error = expectRuntimeError(() => form.setValue("products", [{ name: "A" }, { name: "A" }]));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.IDENTITY_RESOLVER_FAILED);
    expect(error.diagnostics[0]?.metadata).not.toHaveProperty("exception");
    expect(form.getValues()).toBe(before);
  });

  test("reset rebuilds array identity even when values already match", () => {
    const form = createForm(compileList(), { initialValues: { products: [{ name: "A" }] } });
    const oldId = form.array("products").items()[0]!.id;
    const stale = form.array("products").item(0);
    form.reset();
    expect(form.array("products").items()[0]!.id).not.toBe(oldId);
    expect(form.getState().version).toBe(1);
    const error = expectRuntimeError(() => stale.getValue("name"));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.STALE_SCOPE);
  });
});

describe("facades selectors and lifecycle", () => {
  test("scopes follow ids across move and do not rebind removed indexes", () => {
    const form = createForm(compileList(), { initialValues: { products: [{ name: "A" }, { name: "B" }] } });
    const products = form.array("products");
    const itemA = products.item(0);
    products.item(0).getField("name").touch();
    products.move(0, 1);
    expect(itemA.path).toBe("products[1]");
    expect(itemA.getValue("name")).toBe("A");
    expect(itemA.getField("name").getState().touched).toBe(true);
    expect(products.item(0).getField("name").getState().touched).toBe(false);
    const removed = products.item(0);
    products.remove(0);
    const error = expectRuntimeError(() => removed.setValue("name", "X"));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.STALE_SCOPE);
    expect(form.array("products").items().map((item) => item.value)).toEqual([{ name: "A" }]);
    expect(form.array("products").item(0).getValue("name")).toBe("A");
  });

  test("wide array move does not re-run unrelated item-scoped selectors", () => {
    const items = Array.from({ length: 40 }, (_, index) => ({ name: `n${index}` }));
    const form = createForm(compileList(), { initialValues: { products: items } });
    const ids = form.array("products").items().map((item) => item.id);
    const runs = new Map<string, number>();
    for (const id of ids) {
      subscribeRuntime(
        form,
        createSelector([itemValueSelector(id, "name")], (value) => {
          runs.set(id, (runs.get(id) ?? 0) + 1);
          return value;
        }),
        () => undefined,
      );
    }
    for (const id of ids) {
      runs.set(id, 0);
    }
    form.array("products").move(0, 39);
    expect([...runs.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
    form.array("products").insert(1, { name: "x" });
    expect(form.array("products").items()).toHaveLength(41);
  });

  test("item-scoped selectors ignore move while order selectors update", () => {
    const form = createForm(compileList(), { initialValues: { products: [{ name: "A" }, { name: "B" }] } });
    const id = form.array("products").items()[0]!.id;
    let orderRuns = 0;
    let valueRuns = 0;
    subscribeRuntime(
      form,
      createSelector([arrayOrderSelector("products")], (order) => {
        orderRuns += 1;
        return order;
      }),
      () => undefined,
    );
    subscribeRuntime(
      form,
      createSelector([itemValueSelector(id, "name")], (value) => {
        valueRuns += 1;
        return value;
      }),
      () => undefined,
    );
    orderRuns = 0;
    valueRuns = 0;
    form.array("products").move(0, 1);
    expect(orderRuns).toBe(1);
    expect(valueRuns).toBe(0);
    expect(getRuntimeSnapshot(form, itemPathSelector(id))).toBe("products[1]");
  });

  test("subtree owner sees remove after commit and not after rollback", () => {
    const generations: string[] = [];
    const aborts: string[] = [];
    const model = compileList();
    const failing = createFormWithTestHooks(
      model,
      { initialValues: { products: [{ name: "A" }] } },
      {
        subtreeOwners: [
          {
            name: "validation-probe",
            plan() {
              return {
                abortEffects: [
                  () => {
                    aborts.push("abort");
                  },
                ],
                generationInvalidations: ["run"],
              };
            },
          },
        ],
        phases: {
          syncValidation: () => {
            throw new Error("nope");
          },
        },
      },
    );
    expectRuntimeError(() => failing.array("products").remove(0));
    expect(aborts).toEqual([]);
    const form = createFormWithTestHooks(
      model,
      { initialValues: { products: [{ name: "A" }] } },
      {
        subtreeOwners: [
          {
            name: "validation-probe",
            plan() {
              generations.push("plan");
              return {
                abortEffects: [
                  () => {
                    aborts.push("abort");
                  },
                ],
                generationInvalidations: ["run"],
              };
            },
          },
        ],
      },
    );
    form.array("products").remove(0);
    expect(generations).toEqual(["plan"]);
    expect(aborts).toEqual(["abort"]);
    expect(peekFormRuntime(form).ownerGenerations.get("run")).toBe(1);
  });
});

describe("object materialize vs array oob", () => {
  test("creates missing objects and rejects out-of-range array writes", () => {
    const form = createForm(compileList(), { initialValues: { products: [{ name: "A" }] } });
    form.setValue("products[0].name", "Z");
    expect(form.getValue("products[0].name")).toBe("Z");
    const error = expectRuntimeError(() => form.setValue("products[3].name", "nope"));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.ARRAY_INDEX_OUT_OF_RANGE);
    expect((form.getValue("products") as JsonValue[]).length).toBe(1);
  });
});
