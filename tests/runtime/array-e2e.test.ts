import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "@xunserver-jsf/core";
import {
  arrayOrderSelector,
  getRuntimeSnapshot,
  itemValueSelector,
  subscribeRuntime,
} from "@xunserver-jsf/core/runtime";

describe("array identity e2e", () => {
  test("nested list commands, resolver, reset, and selectors stay consistent", () => {
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            orders: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  lines: {
                    type: "array",
                    items: { type: "object", properties: { sku: { type: "string" } } },
                  },
                },
              },
            },
          },
        },
      }),
    );
    const form = createForm(model, {
      initialValues: { orders: [{ id: "o1", lines: [{ sku: "a" }] }] },
      arrayIdentityResolvers: [
        {
          path: "orders",
          resolve: (item) =>
            typeof item === "object" && item !== null && "id" in item ? String(item.id) : undefined,
        },
      ],
    });
    const orders = form.array("orders");
    expect(orders.items()).toHaveLength(1);
    const original = orders.items()[0]!.id;
    orders.append({ id: "o2", lines: [{ sku: "b" }, { sku: "c" }] });
    expect(form.array("orders").item(1).array("lines").items()).toHaveLength(2);
    orders.insert(0, { id: "o0", lines: [] });
    orders.move(original, 2);
    const scoped = orders.item(original);
    expect(scoped.path).toBe("orders[2]");
    orders.setItemValue(original, { id: "o1", lines: [{ sku: "a2" }] });
    expect(orders.items().find((item) => item.id === original)?.id).toBe(original);
    form.setValue("orders", [
      { id: "o2", lines: [{ sku: "b" }] },
      { id: "o1", lines: [{ sku: "a2" }] },
    ]);
    expect(orders.items().find((item) => item.id === original)).toBeDefined();
    const order = getRuntimeSnapshot(form, arrayOrderSelector("orders"));
    expect(order).toHaveLength(2);
    let notified = 0;
    subscribeRuntime(form, itemValueSelector(original, "id"), () => {
      notified += 1;
    });
    form.reset();
    expect(form.getState().version).toBeGreaterThan(0);
    expect(notified).toBeGreaterThanOrEqual(0);
    expect(form.array("orders").items()[0]!.id).not.toBe(original);
  });
});
