import { compileForm, defineForm } from "@xunserver-jsf/core";
import * as core from "@xunserver-jsf/core";
import { describe, expect, test, vi } from "vitest";
import { createDemoEnvironment } from "../environment.js";
import {
  collectFieldNodes,
  createEmptyVisualDocument,
  createVisualIdAllocator,
  exportVisualDefinitionTexts,
  exportVisualSchemaText,
  exportVisualUiSchemaText,
  exportWorkbenchSnapshots,
  getFixture,
  importVisualDocument,
  reduceVisualDocument,
  ROOT_EDITOR_NODE_ID,
  UNSUPPORTED_FIXTURES,
} from "./index.js";

const environment = createDemoEnvironment();

describe("visual conversion", () => {
  test("VSE-DETERMINISTIC-EXPORT repeats schema bytes", () => {
    const imported = importVisualDocument(
      getFixture("supported.root-scalar-fields").schemaText,
      getFixture("supported.root-scalar-fields").uiSchemaText,
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    const first = exportVisualSchemaText(imported.document);
    const second = exportVisualSchemaText(imported.document);
    expect(first).toBe(second);
    expect(first).toBe(exportVisualSchemaText(imported.document));
    expect(first).toContain("  ");
    expect(first).toMatch(/"properties": \{[\s\S]*"name"/);
    expect(JSON.parse(first).required).toEqual(["name"]);
    const ui = exportVisualUiSchemaText(imported.document);
    expect(ui).toBe(exportVisualUiSchemaText(imported.document));
    expect(JSON.parse(ui).fields.name.widget).toBe("text");
    expect(JSON.stringify(JSON.parse(ui).fields.name)).not.toContain("required");
  });

  test("VSE-ADD-LAYOUT presentation layout does not change data hierarchy", () => {
    const imported = importVisualDocument(
      getFixture("supported.group-and-layouts").schemaText,
      getFixture("supported.group-and-layouts").uiSchemaText,
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    const schema = JSON.parse(exportVisualSchemaText(imported.document)) as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(schema.properties)).toEqual(["first", "second", "third"]);
    const compiled = compileForm(
      defineForm({
        schema: JSON.parse(exportVisualSchemaText(imported.document)),
        uiSchema: JSON.parse(exportVisualUiSchemaText(imported.document)),
        rules: [],
        config: { schemaValidator: "ajv-2020" },
      }),
      { environment },
    );
    expect(compiled.model.data.root.kind).toBe("object");
    const widgets = [...compiled.model.ui.fields.values()].map((field) => field.widget).sort();
    expect(widgets).toEqual(["number", "text", "text"]);
  });

  test("VSE-IMPORT-SUPPORTED round-trips supported documents including implicit layout", () => {
    for (const id of ["supported.root-scalar-fields", "supported.no-explicit-layout", "supported.required-select", "supported.required-and-visible"]) {
      const fixture = getFixture(id);
      const imported = importVisualDocument(fixture.schemaText, fixture.uiSchemaText);
      expect(imported.ok, id).toBe(true);
      if (!imported.ok) {
        continue;
      }
      const exported = exportVisualDefinitionTexts(imported.document);
      const again = importVisualDocument(exported.schemaText, exported.uiSchemaText);
      expect(again.ok, id).toBe(true);
      if (!again.ok) {
        continue;
      }
      expect(collectFieldNodes(again.document).map((field) => field.key)).toEqual(
        collectFieldNodes(imported.document).map((field) => field.key),
      );
      expect(collectFieldNodes(again.document).map((field) => field.required)).toEqual(
        collectFieldNodes(imported.document).map((field) => field.required),
      );
      const ui = JSON.parse(exported.uiSchemaText) as { fields: Record<string, { widget?: string }> };
      for (const field of collectFieldNodes(imported.document)) {
        expect(ui.fields[field.key]?.widget).toBe(field.widget);
      }
    }
  });

  test("VSE-IMPORT-UNSUPPORTED does not return a writable document", () => {
    const original = getFixture("unsupported.unknown-keyword").schemaText;
    for (const fixture of UNSUPPORTED_FIXTURES) {
      const result = importVisualDocument(fixture.schemaText, fixture.uiSchemaText);
      expect(result.ok, fixture.id).toBe(false);
      if (result.ok) {
        continue;
      }
      expect(result.diagnostics.length, fixture.id).toBeGreaterThan(0);
      expect("document" in result, fixture.id).toBe(false);
      expect(result.diagnostics.every((item) => item.code.startsWith("playground.visual."))).toBe(true);
    }
    expect(getFixture("unsupported.unknown-keyword").schemaText).toBe(original);
  });

  test("VSE-EXPORT-COPY-DOWNLOAD omits formData, live values and EditorNodeId", () => {
    const fixture = getFixture("supported.root-scalar-fields");
    const snapshot = exportWorkbenchSnapshots({
      schemaText: fixture.schemaText,
      uiSchemaText: fixture.uiSchemaText,
      rulesText: "[]",
      configText: '{"schemaValidator":"ajv-2020"}',
      formDataText: '{"name":"Ada","secret":true}',
    });
    expect(snapshot.mimeType).toBe("application/json");
    expect(snapshot.definitionFileName).toBe("form-definition.json");
    expect(snapshot.definitionText).toContain('"schema"');
    expect(snapshot.definitionText).toContain('"uiSchema"');
    expect(snapshot.definitionText).toContain('"rules"');
    expect(snapshot.definitionText).toContain('"config"');
    expect(snapshot.definitionText).not.toContain("formData");
    expect(snapshot.definitionText).not.toContain("secret");
    expect(snapshot.definitionText).not.toContain("enode-");
    expect(snapshot.definitionText).not.toContain("serialize");
  });

  test("performance budget for 100 scalar fields stays sub-second without compile", () => {
    const spy = vi.spyOn(core, "compileForm");
    try {
      const allocator = createVisualIdAllocator();
      let document = createEmptyVisualDocument();
      const started = Date.now();
      for (let index = 0; index < 100; index += 1) {
        const added = reduceVisualDocument(
          document,
          { type: "AddNode", parentId: ROOT_EDITOR_NODE_ID, index, palette: "text" },
          allocator,
        );
        expect(added.ok).toBe(true);
        if (!added.ok) {
          return;
        }
        document = added.document;
      }
      const exported = exportVisualDefinitionTexts(document);
      const imported = importVisualDocument(exported.schemaText, exported.uiSchemaText);
      expect(imported.ok).toBe(true);
      if (!imported.ok) {
        return;
      }
      const first = imported.document.root.children[0];
      const last = imported.document.root.children[99];
      expect(first !== undefined && last !== undefined).toBe(true);
      if (first === undefined || last === undefined) {
        return;
      }
      const moved = reduceVisualDocument(
        imported.document,
        { type: "MoveNode", nodeId: last.id, targetParentId: ROOT_EDITOR_NODE_ID, targetIndex: 0 },
        allocator,
      );
      expect(moved.ok).toBe(true);
      if (!moved.ok) {
        return;
      }
      exportVisualDefinitionTexts(moved.document);
      expect(Date.now() - started).toBeLessThan(1000);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
