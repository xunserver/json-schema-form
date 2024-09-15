import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "../index.js";
import type { FieldView, ViewNode } from "../model/ui.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import {
  createSelector,
  formSelector,
  getRuntimeSnapshot,
  subscribeRuntime,
  viewSelector,
} from "./index.js";
import { createFormWithTestHooks } from "./test-harness.js";
import { compileDuplicateFieldModel, compilePersonModel, expectRuntimeError } from "./runtime.test-utils.js";

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

function collectViews(node: ViewNode): ViewNode[] {
  const views: ViewNode[] = [node];
  if ("children" in node) {
    for (const child of node.children) {
      views.push(...collectViews(child));
    }
  }
  if ("itemLayout" in node) {
    for (const child of node.itemLayout) {
      views.push(...collectViews(child));
    }
  }
  return views;
}

describe("blur command", () => {
  test("clears focused once without touching values", () => {
    const model = compilePersonModel();
    const form = createForm(model, { initialValues: { name: "Ada" } });
    const view = collectFieldViews(model.ui.viewTree).find((item) => item.fieldPath === "name");
    expect(view).toBeDefined();
    form.focus(view!.id);
    const versions: number[] = [];
    subscribeRuntime(form, formSelector(), (snapshot) => {
      versions.push(snapshot.version);
    });
    form.blur(view!.id);
    expect(getRuntimeSnapshot(form, viewSelector(view!.id)).focused).toBe(false);
    expect(form.getField("name").getState().touched).toBe(false);
    expect(form.getValue("name")).toBe("Ada");
    expect(form.getState().version).toBe(2);
    expect(versions).toEqual([2]);
  });

  test("treats blur of an unfocused view as a no-op", () => {
    const model = compilePersonModel();
    const form = createForm(model, { initialValues: { name: "Ada" } });
    const view = collectFieldViews(model.ui.viewTree)[0]!;
    const snapshot = form.getState();
    let notified = 0;
    subscribeRuntime(form, formSelector(), () => {
      notified += 1;
    });
    form.blur(view.id);
    expect(form.getState()).toBe(snapshot);
    expect(form.getState().version).toBe(0);
    expect(notified).toBe(0);
  });

  test("records blur interaction for a validation owner and ignores setValue/focus", () => {
    const model = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            products: {
              type: "array",
              items: { type: "object", properties: { name: { type: "string" } } },
            },
          },
        },
      }),
    ).model;
    const records: unknown[] = [];
    const form = createFormWithTestHooks(
      model,
      { initialValues: { products: [{ name: "A" }] } },
      {
        phases: {
          syncValidation: (context) => {
            records.push(JSON.parse(JSON.stringify(context.changeSet.blurred)));
          },
        },
      },
    );
    const view = collectFieldViews(model.ui.viewTree).find((item) => item.fieldPath === "products[].name")!;
    const item = form.array("products").item(0);
    form.setValue("products[0].name", "B");
    item.focus(view.id);
    item.blur(view.id);
    expect(records).toEqual([[], [], [{ viewId: view.id, path: "products[0].name", itemChain: [expect.any(String)] }]]);
    const last = records.at(-1) as Array<Record<string, unknown>>;
    expect(JSON.stringify(last)).not.toMatch(/rn:|RuntimeNodeId|setValue/);
  });

  test("remove clears focused without emitting a blur interaction", () => {
    const model = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            products: {
              type: "array",
              items: { type: "object", properties: { name: { type: "string" } } },
            },
          },
        },
      }),
    ).model;
    const records: unknown[] = [];
    const form = createFormWithTestHooks(
      model,
      { initialValues: { products: [{ name: "A" }, { name: "B" }] } },
      {
        phases: {
          syncValidation: (context) => {
            records.push(context.changeSet.blurred);
          },
        },
      },
    );
    const view = collectFieldViews(model.ui.viewTree).find((item) => item.fieldPath === "products[].name")!;
    form.array("products").item(0).focus(view.id);
    expect(getRuntimeSnapshot(form, viewSelector(view.id)).focused).toBe(true);
    form.array("products").remove(0);
    expect(getRuntimeSnapshot(form, viewSelector(view.id)).focused).toBe(false);
    expect(records.at(-1)).toEqual([]);
    const next = form.array("products").item(0);
    expect(getRuntimeSnapshot(form, viewSelector(view.id)).focused).toBe(false);
    next.blur(view.id);
    expect(form.getState().version).toBe(2);
    void next;
  });

  test.each([
    ["unknown view", (form: ReturnType<typeof createForm>) => form.blur("view:missing" as never)],
    ["non-view target", (form: ReturnType<typeof createForm>) => form.blur("data:name:node" as never)],
  ] as const)("%s rolls back without notifying", (_label, run) => {
    const form = createForm(compilePersonModel(), { initialValues: { name: "Ada" } });
    const snapshot = form.getState();
    const values = form.getValues();
    let notified = 0;
    subscribeRuntime(form, formSelector(), () => {
      notified += 1;
    });
    const error = expectRuntimeError(() => run(form));
    expect(error.diagnostics[0]?.source).toBe("runtime");
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_VIEW);
    expect(form.getValues()).toBe(values);
    expect(form.getState()).toBe(snapshot);
    expect(form.getState().version).toBe(0);
    expect(notified).toBe(0);
  });

  test("stale scoped blur is a stable runtime diagnostic", () => {
    const model = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            products: {
              type: "array",
              items: { type: "object", properties: { name: { type: "string" } } },
            },
          },
        },
      }),
    ).model;
    const form = createForm(model, { initialValues: { products: [{ name: "A" }] } });
    const view = collectFieldViews(model.ui.viewTree).find((item) => item.fieldPath === "products[].name")!;
    const stale = form.array("products").item(0);
    form.array("products").remove(0);
    const snapshot = form.getState();
    let notified = 0;
    subscribeRuntime(form, formSelector(), () => {
      notified += 1;
    });
    const error = expectRuntimeError(() => stale.blur(view.id));
    expect(error.diagnostics[0]?.source).toBe("runtime");
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.STALE_SCOPE);
    expect(form.getState()).toBe(snapshot);
    expect(notified).toBe(0);
  });
});

describe("collapsed and activeTab", () => {
  test("equal writes are no-ops", () => {
    const model = compilePersonModel();
    const form = createForm(model, { initialValues: { name: "Ada" } });
    const view = model.ui.viewTree;
    form.setCollapsed(view.id, true);
    const version = form.getState().version;
    form.setCollapsed(view.id, true);
    expect(form.getState().version).toBe(version);
    form.setActiveTab(view.id, "advanced");
    const afterTab = form.getState().version;
    form.setActiveTab(view.id, "advanced");
    expect(form.getState().version).toBe(afterTab);
  });

  test("only the target view receives collapsed and activeTab", () => {
    const model = compileDuplicateFieldModel();
    const form = createForm(model, { initialValues: { name: "Ada" } });
    const group = collectViews(model.ui.viewTree).find((item) => item.kind === "group")!;
    const field = collectFieldViews(model.ui.viewTree).find((item) => item.fieldPath === "name")!;
    form.setCollapsed(group.id, true);
    form.setActiveTab(group.id, "advanced");
    expect(getRuntimeSnapshot(form, viewSelector(group.id))).toMatchObject({
      collapsed: true,
      activeTab: "advanced",
    });
    expect(getRuntimeSnapshot(form, viewSelector(field.id))).toMatchObject({
      collapsed: false,
      activeTab: undefined,
    });
    form.setActiveTab(group.id, "not-in-layout");
    expect(getRuntimeSnapshot(form, viewSelector(group.id)).activeTab).toBe("not-in-layout");
    form.setActiveTab(group.id, null);
    expect(getRuntimeSnapshot(form, viewSelector(group.id)).activeTab).toBeUndefined();
  });

  test("reset and subtree lifecycle restore defaults without inheriting onto new items", () => {
    const model = compileForm(
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
          },
        },
      }),
    ).model;
    const form = createForm(model, {
      initialValues: { products: [{ name: "A", lines: [{ sku: "1" }] }, { name: "B", lines: [] }] },
    });
    const arrayView = collectViews(model.ui.viewTree).find((item) => item.kind === "array")!;
    const nameView = collectFieldViews(model.ui.viewTree).find((item) => item.fieldPath === "products[].name")!;
    form.array("products").item(0).setCollapsed(arrayView.id, true);
    form.array("products").item(0).setActiveTab(nameView.id, "meta");
    form.array("products").item(0).focus(nameView.id);
    form.array("products").remove(0);
    expect(getRuntimeSnapshot(form, viewSelector(arrayView.id)).collapsed).toBe(false);
    expect(getRuntimeSnapshot(form, viewSelector(nameView.id)).activeTab).toBeUndefined();
    expect(getRuntimeSnapshot(form, viewSelector(nameView.id)).focused).toBe(false);
    form.array("products").item(0).setCollapsed(arrayView.id, true);
    form.reset();
    expect(getRuntimeSnapshot(form, viewSelector(arrayView.id)).collapsed).toBe(false);
    expect(getRuntimeSnapshot(form, viewSelector(nameView.id)).activeTab).toBeUndefined();
  });

  test("only the target view selector is notified and snapshots stay frozen", () => {
    const model = compileDuplicateFieldModel();
    const form = createForm(model, { initialValues: { name: "Ada" } });
    const views = collectFieldViews(model.ui.viewTree).filter((item) => item.fieldPath === "name");
    let otherRuns = 0;
    const other = createSelector([viewSelector(views[1]!.id)], (snapshot) => {
      otherRuns += 1;
      return snapshot.collapsed;
    });
    subscribeRuntime(form, viewSelector(views[0]!.id), () => undefined);
    subscribeRuntime(form, other, () => undefined);
    otherRuns = 0;
    form.setCollapsed(views[0]!.id, true);
    const snapshot = getRuntimeSnapshot(form, viewSelector(views[0]!.id));
    expect(snapshot.collapsed).toBe(true);
    expect(otherRuns).toBe(0);
    expect(() => {
      (snapshot as { collapsed: boolean }).collapsed = false;
    }).toThrow();
    expect(getRuntimeSnapshot(form, viewSelector(views[0]!.id)).collapsed).toBe(true);
  });
});
