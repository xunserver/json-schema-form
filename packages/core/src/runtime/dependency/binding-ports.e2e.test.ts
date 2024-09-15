import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "../../index.js";
import type { FieldView, ViewNode } from "../../model/ui/ui.js";
import {
  currentBindingSelector,
  getRenderScope,
  getRuntimeSnapshot,
  viewSelector,
} from "../index.js";

function collectFieldViews(node: ViewNode): FieldView[] {
  const views: FieldView[] = [];
  if (node.kind === "field") {
    views.push(node);
  }
  if ("children" in node) {
    for (const child of node.children) {
      views.push(...collectFieldViews(child));
    }
  }
  if ("itemLayout" in node) {
    for (const child of node.itemLayout) {
      views.push(...collectFieldViews(child));
    }
  }
  return views;
}

describe("renderer binding ports e2e", () => {
  test("nested array form exercises commands scopes and required together", () => {
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            type: { type: "string" },
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
          },
          if: { properties: { type: { const: "company" } }, required: ["type"] },
          then: { properties: { companyName: { type: "string" } }, required: ["companyName"] },
        },
      }),
    );
    const form = createForm(model, {
      initialValues: {
        type: "person",
        companyName: "Acme",
        products: [
          { name: "A", lines: [{ sku: "1" }] },
          { name: "B", lines: [{ sku: "2" }] },
        ],
      },
    });
    const nameView = collectFieldViews(model.ui.viewTree).find((item) => item.fieldPath === "products[].name")!;
    const group = model.ui.viewTree;
    const item = form.array("products").item(0);
    item.focus(nameView.id);
    expect(getRuntimeSnapshot(form, viewSelector(nameView.id)).focused).toBe(true);
    item.blur(nameView.id);
    expect(getRuntimeSnapshot(form, viewSelector(nameView.id)).focused).toBe(false);
    form.setCollapsed(group.id, true);
    form.setActiveTab(group.id, "lines");
    expect(getRuntimeSnapshot(form, viewSelector(group.id))).toMatchObject({ collapsed: true, activeTab: "lines" });
    const scope = getRenderScope(item);
    expect(scope.resolve("products[].name")).toBe("products[0].name");
    const id = form.array("products").items()[0]!.id;
    form.array("products").move(0, 1);
    expect(scope.binding.path).toBe("products[1]");
    expect(scope.binding.itemId).toBe(id);
    expect(scope.binding.stale).toBe(false);
    form.array("products").remove(1);
    expect(scope.binding.stale).toBe(true);
    expect(form.getField("companyName").getState().required).toBe(false);
    const version = form.getState().version;
    form.setValue("type", "company");
    expect(form.getState().version).toBe(version + 1);
    expect(form.getField("companyName").getState().required).toBe(true);
    form.reset();
    expect(getRuntimeSnapshot(form, viewSelector(group.id)).collapsed).toBe(false);
    expect(getRuntimeSnapshot(form, currentBindingSelector("products[0]")).stale).toBe(false);
  });
});
