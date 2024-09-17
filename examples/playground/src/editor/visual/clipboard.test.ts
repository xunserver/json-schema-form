/** @vitest-environment jsdom */
import { afterEach, describe, expect, test, vi } from "vitest";
import { getFixture, exportWorkbenchSnapshots } from "@xunserver-jsf/example-shared";
import { copyTextToClipboard, downloadUtf8Json } from "./clipboard";

describe("visual export clipboard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("VSE-EXPORT-COPY-DOWNLOAD copies and downloads UTF-8 JSON then revokes URL", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const createObjectURL = vi.fn(() => "blob:visual-export");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "a") {
        return { href: "", download: "", rel: "", click, remove() {} } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tag);
    });
    const fixture = getFixture("supported.root-scalar-fields");
    const snapshot = exportWorkbenchSnapshots({
      schemaText: fixture.schemaText,
      uiSchemaText: fixture.uiSchemaText,
      rulesText: "[]",
      configText: "{}",
      formDataText: "{\"live\":true}",
    });
    await copyTextToClipboard(snapshot.schemaText);
    expect(writeText).toHaveBeenCalledWith(snapshot.schemaText);
    downloadUtf8Json(snapshot.definitionText, snapshot.definitionFileName, snapshot.mimeType);
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:visual-export");
    expect(snapshot.definitionText).not.toContain("live");
  });
});
