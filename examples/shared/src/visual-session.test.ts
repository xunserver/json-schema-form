import { describe, expect, test, vi } from "vitest";
import {
  commitVisualIfFresh,
  createPlaygroundController,
  emptySupportedDefinitionTexts,
  exportVisualDefinitionTexts,
  getFixture,
  importVisualDocument,
  isParentToPreviewMessage,
  PLAYGROUND_CHANNEL,
  visualSourceKey,
} from "./index.js";

describe("visual session and controller", () => {
  test("replaceDefinitionTexts updates schema/uiSchema once and preserves other editors", () => {
    vi.useFakeTimers();
    const controller = createPlaygroundController();
    try {
      controller.setExample("simple");
      const before = controller.getSnapshot();
      const rulesText = before.workbench.rulesText;
      const configText = before.workbench.configText;
      const formDataText = before.workbench.formDataText;
      const fixture = getFixture("supported.root-scalar-fields");
      controller.replaceDefinitionTexts({
        schemaText: fixture.schemaText,
        uiSchemaText: fixture.uiSchemaText,
      });
      vi.advanceTimersByTime(300);
      const after = controller.getSnapshot();
      expect(after.workbench.schemaText).toBe(fixture.schemaText);
      expect(after.workbench.uiSchemaText).toBe(fixture.uiSchemaText);
      expect(after.workbench.rulesText).toBe(rulesText);
      expect(after.workbench.configText).toBe(configText);
      expect(after.workbench.formDataText).toBe(formDataText);
      expect(after.broadcastDocument).not.toBeNull();
      expect(after.documentKey).not.toBe(before.documentKey);
    } finally {
      controller.dispose();
      vi.useRealTimers();
    }
  });

  test("stale visual session cannot overwrite newer text", () => {
    const fixture = getFixture("supported.root-scalar-fields");
    const sessionKey = visualSourceKey(fixture.schemaText, fixture.uiSchemaText);
    expect(commitVisualIfFresh({ sessionKey, schemaText: fixture.schemaText, uiSchemaText: fixture.uiSchemaText }).ok).toBe(
      true,
    );
    const stale = commitVisualIfFresh({
      sessionKey,
      schemaText: fixture.schemaText,
      uiSchemaText: '{"fields":{}}',
    });
    expect(stale.ok).toBe(false);
  });

  test("VSE-CONFIRM-NEW-DOCUMENT replaces only schema/uiSchema after confirm", () => {
    vi.useFakeTimers();
    const controller = createPlaygroundController();
    try {
      controller.setExample("simple");
      vi.advanceTimersByTime(300);
      const before = controller.getSnapshot().workbench;
      const unsupported = getFixture("unsupported.unknown-keyword");
      const imported = importVisualDocument(unsupported.schemaText, unsupported.uiSchemaText);
      expect(imported.ok).toBe(false);
      expect(controller.getSnapshot().workbench).toEqual(before);
      const empty = emptySupportedDefinitionTexts();
      controller.replaceDefinitionTexts(empty);
      vi.advanceTimersByTime(300);
      const created = controller.getSnapshot().workbench;
      expect(created.schemaText).toBe(empty.schemaText);
      expect(created.uiSchemaText).toBe(empty.uiSchemaText);
      expect(created.rulesText).toBe(before.rulesText);
      expect(created.configText).toBe(before.configText);
      expect(created.formDataText).toBe(before.formDataText);
    } finally {
      controller.dispose();
      vi.useRealTimers();
    }
  });

  test("VSE-COMPILE-PRESERVE keeps broadcast on visual compile failure", () => {
    vi.useFakeTimers();
    const controller = createPlaygroundController();
    try {
      controller.setExample("simple");
      vi.advanceTimersByTime(300);
      const ok = controller.getSnapshot();
      expect(ok.broadcastDocument).not.toBeNull();
      const okDoc = ok.broadcastDocument;
      const okKey = ok.documentKey;
      controller.replaceDefinitionTexts({
        schemaText: "{",
        uiSchemaText: ok.workbench.uiSchemaText,
      });
      vi.advanceTimersByTime(300);
      const failed = controller.getSnapshot();
      expect(failed.status).toBe("error");
      expect(failed.documentKey).toBe(okKey);
      expect(failed.broadcastDocument).toBe(okDoc);
    } finally {
      controller.dispose();
      vi.useRealTimers();
    }
  });

  test("VSE-PROTOCOL-UNCHANGED document messages still exclude editor fields", () => {
    const message = {
      channel: PLAYGROUND_CHANNEL,
      type: "document" as const,
      exampleId: "simple",
      document: null,
      documentKey: "k",
    };
    expect(isParentToPreviewMessage(message)).toBe(true);
    expect(Object.keys(message).sort()).toEqual(["channel", "document", "documentKey", "exampleId", "type"]);
  });
});
