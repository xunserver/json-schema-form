import { describe, expect, test } from "vitest";
import {
  ROOT_EDITOR_NODE_ID,
  collectFieldKeys,
  createEmptyVisualDocument,
  createPaletteNode,
  createVisualIdAllocator,
  exportVisualDefinitionTexts,
  PALETTE_ITEMS,
} from "./index.js";

describe("visual authoring model", () => {
  test("VSE-ADD-SCALAR-FIELDS creates default palette nodes without leaking EditorNodeId", () => {
    const allocator = createVisualIdAllocator();
    const keys = new Set<string>();
    const created = PALETTE_ITEMS.map((item) => {
      const node = createPaletteNode(item.kind, allocator, keys);
      if (node.kind === "field") {
        keys.add(node.key);
      }
      return node;
    });
    const kinds = created.map((node) => (node.kind === "field" ? node.palette : node.kind === "group" ? "group" : node.variant));
    expect(kinds).toEqual(["text", "textarea", "number", "boolean", "select", "group", "stack", "row", "grid"]);
    const select = created.find((node) => node.kind === "field" && node.palette === "select");
    expect(select?.kind === "field" && select.enumValues).toEqual(["option1"]);
    const stack = created.find((node) => node.kind === "layout" && node.variant === "stack");
    expect(stack?.kind === "layout" && stack.columns).toBe(1);
    const row = created.find((node) => node.kind === "layout" && node.variant === "row");
    expect(row?.kind === "layout" && row.columns).toBe(2);
    const grid = created.find((node) => node.kind === "layout" && node.variant === "grid");
    expect(grid?.kind === "layout" && grid.columns).toBe(3);
    const empty = createEmptyVisualDocument();
    expect(empty.root.id).toBe(ROOT_EDITOR_NODE_ID);
    expect(Object.isFrozen(empty)).toBe(true);
    expect(collectFieldKeys(empty)).toEqual([]);
    const exported = exportVisualDefinitionTexts(empty);
    expect(exported.schemaText).not.toContain("enode-");
    expect(exported.uiSchemaText).not.toContain("enode-");
    expect(exported.schemaText).not.toContain(ROOT_EDITOR_NODE_ID);
  });
});
