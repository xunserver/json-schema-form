import { describe, expect, test, vi } from "vitest";
import {
  compileWorkbenchDocument,
  createDemoEnvironment,
  createPlaygroundController,
  exampleToDocument,
  getCatalogExample,
  isParentToPreviewMessage,
  isPreviewToParentMessage,
  listCatalogExamples,
  planWorkbenchCompile,
  PLAYGROUND_CHANNEL,
  readExampleFromSearch,
  workbenchDocumentKey,
} from "./index.js";

describe("playground workbench", () => {
  const environment = createDemoEnvironment();

  test("planWorkbenchCompile skips an already applied document and remounts on example switch", () => {
    expect(
      planWorkbenchCompile({
        lastAppliedKey: "a",
        nextKey: "a",
        hasForm: true,
        exampleSwitch: false,
      }),
    ).toEqual({ skip: true });
    expect(
      planWorkbenchCompile({
        lastAppliedKey: "a",
        nextKey: "b",
        hasForm: true,
        exampleSwitch: true,
      }),
    ).toEqual({ skip: false, immediate: true, preserveFormOnFailure: false });
    expect(
      planWorkbenchCompile({
        lastAppliedKey: "a",
        nextKey: "b",
        hasForm: true,
        exampleSwitch: false,
      }),
    ).toEqual({ skip: false, immediate: false, preserveFormOnFailure: true });
    expect(
      planWorkbenchCompile({
        lastAppliedKey: null,
        nextKey: "a",
        hasForm: false,
        exampleSwitch: false,
      }),
    ).toEqual({ skip: false, immediate: true, preserveFormOnFailure: false });
  });

  test("every catalog example compiles and computed-array serializes totals", () => {
    for (const meta of listCatalogExamples()) {
      const example = getCatalogExample(meta.id);
      expect(example, meta.id).toBeDefined();
      if (example === undefined) {
        continue;
      }
      const document = exampleToDocument(example);
      const result = compileWorkbenchDocument(document, environment);
      expect(result.ok, meta.id).toBe(true);
      if (!result.ok) {
        continue;
      }
      if (meta.id === "computed-array") {
        expect(result.form.serialize()).toMatchObject({
          discount: 5,
          subtotal: 45,
          total: 40,
          products: [
            { title: "Widget", quantity: 2, price: 10, lineTotal: 20 },
            { title: "Gadget", quantity: 1, price: 25, lineTotal: 25 },
          ],
        });
      }
      if (meta.id === "kitchen-sink") {
        expect(result.form.getValue("meeting")).toBe("2026-09-15T12:00:00+00:00");
      }
      if (meta.id === "all-fields") {
        expect(example.uiSchema).toBeDefined();
        expect(example.uiSchema && "layout" in example.uiSchema).toBe(false);
        expect(result.definition.uiSchema?.layout).toBeUndefined();
        const widgets = new Set(
          [...result.form.model.ui.fields.values()].map((field) => field.widget),
        );
        expect([...widgets].toSorted()).toEqual(
          [
            "checkbox",
            "company.currency",
            "date",
            "datetime",
            "multi-select",
            "number",
            "select",
            "switch",
            "text",
            "textarea",
          ],
        );
        expect(result.form.serialize()).toMatchObject({
          name: "Ada",
          age: 36,
          score: 98.5,
          role: "admin",
          tags: ["a", "c"],
          nickname: null,
          address: { city: "London" },
          aliases: ["A.L.", "Ada L."],
          products: [
            { title: "Widget", quantity: 2, price: 10 },
            { title: "Gadget", quantity: 1, price: 25.5 },
          ],
          span: [1, 10],
        });
      }
    }
  });

  test("parse reports every invalid editor instead of stopping at the first", () => {
    const example = getCatalogExample("simple");
    expect(example).toBeDefined();
    if (example === undefined) {
      return;
    }
    const document = exampleToDocument(example);
    const result = compileWorkbenchDocument(
      {
        ...document,
        schemaText: "{",
        uiSchemaText: "[",
      },
      environment,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.stage).toBe("parse");
    expect(result.diagnostics.map((diagnostic) => diagnostic.metadata?.editor)).toEqual(["schema", "uiSchema"]);
  });

  test("workbenchDocumentKey changes when one editor changes", () => {
    const example = getCatalogExample("simple");
    expect(example).toBeDefined();
    if (example === undefined) {
      return;
    }
    const document = exampleToDocument(example);
    expect(workbenchDocumentKey(document)).toBe(workbenchDocumentKey({ ...document }));
    expect(workbenchDocumentKey(document)).not.toBe(
      workbenchDocumentKey({ ...document, formDataText: "{\"name\":\"Other\"}" }),
    );
  });

  test("protocol guards recognize playground channel messages", () => {
    expect(
      isParentToPreviewMessage({
        channel: PLAYGROUND_CHANNEL,
        type: "document",
        exampleId: "simple",
        document: null,
        documentKey: "k",
      }),
    ).toBe(true);
    expect(
      isPreviewToParentMessage({
        channel: PLAYGROUND_CHANNEL,
        type: "ready",
        previewId: "antd",
      }),
    ).toBe(true);
    expect(isParentToPreviewMessage({ channel: "other", type: "document" })).toBe(false);
    expect(readExampleFromSearch("?example=conditional")).toBe("conditional");
    expect(readExampleFromSearch("example=missing")).toBe("kitchen-sink");
  });

  test("shared controller diagnoses catalog and keeps broadcast on parse errors", () => {
    vi.useFakeTimers();
    const controller = createPlaygroundController();
    try {
      const first = controller.getSnapshot();
      expect(first.broadcastDocument).not.toBeNull();
      expect(first.status).toBe("ok");
      const firstKey = first.documentKey;
      controller.setExample("simple");
      expect(controller.getSnapshot().exampleId).toBe("simple");
      expect(controller.getSnapshot().documentKey).not.toBe(firstKey);
      const simpleKey = controller.getSnapshot().documentKey;
      const simpleDoc = controller.getSnapshot().broadcastDocument;
      controller.setActiveTab("schema");
      controller.setEditorText("{");
      vi.advanceTimersByTime(300);
      const failed = controller.getSnapshot();
      expect(failed.status).toBe("error");
      expect(failed.documentKey).toBe(simpleKey);
      expect(failed.broadcastDocument).toBe(simpleDoc);
    } finally {
      controller.dispose();
      vi.useRealTimers();
    }
  });
});
