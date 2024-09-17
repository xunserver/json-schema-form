import { describe, expect, test } from "vitest";
import {
  ROOT_EDITOR_NODE_ID,
  VISUAL_DIAGNOSTIC_CODES,
  createEmptyVisualDocument,
  createVisualIdAllocator,
  dragResultToCommand,
  findNode,
  reduceVisualDocument,
  type UpdateFieldCommand,
  type VisualDocument,
  type VisualFieldNode,
} from "./index.js";

function add(document: VisualDocument, palette: "text" | "textarea" | "number" | "boolean" | "select" | "group" | "stack" | "row" | "grid", allocator = createVisualIdAllocator(), parentId = ROOT_EDITOR_NODE_ID, index?: number) {
  const parent = findNode(document, parentId);
  const children = parent && parent.kind !== "field" ? parent.children.length : 0;
  return reduceVisualDocument(
    document,
    { type: "AddNode", parentId, index: index ?? children, palette },
    allocator,
  );
}

function fieldOf(document: VisualDocument, key: string): VisualFieldNode {
  const node = findNode(document, document.root.children.find((child) => child.kind === "field" && child.key === key)?.id ?? ROOT_EDITOR_NODE_ID);
  if (node === undefined || node.kind !== "field") {
    throw new Error(`missing field ${key}`);
  }
  return node;
}

describe("visual authoring commands", () => {
  test("AddNode and RemoveNode keep identity on failure and suggest selection", () => {
    const allocator = createVisualIdAllocator();
    const empty = createEmptyVisualDocument();
    const first = add(empty, "text", allocator);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const nestedLayout = add(first.document, "stack", allocator);
    expect(nestedLayout.ok).toBe(true);
    if (!nestedLayout.ok) {
      return;
    }
    const layout = nestedLayout.document.root.children[1];
    expect(layout?.kind).toBe("layout");
    if (layout === undefined || layout.kind !== "layout") {
      return;
    }
    const inside = add(nestedLayout.document, "number", allocator, layout.id);
    expect(inside.ok).toBe(true);
    if (!inside.ok) {
      return;
    }
    const failedParent = add(inside.document, "text", allocator, fieldOf(first.document, "text").id);
    expect(failedParent.ok).toBe(false);
    if (failedParent.ok) {
      return;
    }
    expect(failedParent.document).toBe(inside.document);
    const middle = add(inside.document, "boolean", allocator, ROOT_EDITOR_NODE_ID, 1);
    expect(middle.ok).toBe(true);
    if (!middle.ok) {
      return;
    }
    const ids = middle.document.root.children.map((node) => node.kind === "field" ? node.key : node.kind);
    expect(ids[0]).toBe("text");
    expect(ids[1]).toBe("flag");
    const firstId = middle.document.root.children[0]?.id;
    const lastId = middle.document.root.children[middle.document.root.children.length - 1]?.id;
    if (firstId === undefined || lastId === undefined) {
      return;
    }
    const removeFirst = reduceVisualDocument(middle.document, { type: "RemoveNode", nodeId: firstId }, allocator);
    expect(removeFirst.ok).toBe(true);
    if (!removeFirst.ok) {
      return;
    }
    expect(removeFirst.suggestedSelection).toBe(middle.document.root.children[1]?.id);
    const removeLast = reduceVisualDocument(middle.document, { type: "RemoveNode", nodeId: lastId }, allocator);
    expect(removeLast.ok).toBe(true);
    if (!removeLast.ok) {
      return;
    }
    expect(removeLast.suggestedSelection).toBe(middle.document.root.children[middle.document.root.children.length - 2]?.id);
    const missing = reduceVisualDocument(middle.document, { type: "RemoveNode", nodeId: ROOT_EDITOR_NODE_ID }, allocator);
    expect(missing.ok).toBe(false);
    if (missing.ok) {
      return;
    }
    expect(missing.document).toBe(middle.document);
  });

  test("VSE-REJECT-ILLEGAL-NEST MoveNode rejects cycles, fields, and out-of-range index", () => {
    const allocator = createVisualIdAllocator();
    let document = createEmptyVisualDocument();
    const outer = add(document, "stack", allocator);
    expect(outer.ok).toBe(true);
    if (!outer.ok) {
      return;
    }
    document = outer.document;
    const outerLayout = document.root.children[0];
    if (outerLayout === undefined || outerLayout.kind !== "layout") {
      return;
    }
    const inner = add(document, "group", allocator, outerLayout.id);
    expect(inner.ok).toBe(true);
    if (!inner.ok) {
      return;
    }
    document = inner.document;
    const group = document.root.children[0];
    if (group === undefined || group.kind !== "layout") {
      return;
    }
    const groupNode = group.children[0];
    if (groupNode === undefined || groupNode.kind !== "group") {
      return;
    }
    const fieldAdd = add(document, "text", allocator, groupNode.id);
    expect(fieldAdd.ok).toBe(true);
    if (!fieldAdd.ok) {
      return;
    }
    document = fieldAdd.document;
    const field = findNode(document, fieldAdd.suggestedSelection);
    expect(field?.kind).toBe("field");
    if (field === undefined || field.kind !== "field") {
      return;
    }
    const cycle = reduceVisualDocument(
      document,
      { type: "MoveNode", nodeId: outerLayout.id, targetParentId: groupNode.id, targetIndex: 0 },
      allocator,
    );
    expect(cycle.ok).toBe(false);
    if (cycle.ok) {
      return;
    }
    expect(cycle.document).toBe(document);
    expect(cycle.diagnostics[0]?.code).toBe(VISUAL_DIAGNOSTIC_CODES.cycle);
    const intoField = reduceVisualDocument(
      document,
      { type: "MoveNode", nodeId: groupNode.id, targetParentId: field.id, targetIndex: 0 },
      allocator,
    );
    expect(intoField.ok).toBe(false);
    if (intoField.ok) {
      return;
    }
    expect(intoField.document).toBe(document);
    expect(intoField.diagnostics[0]?.code).toBe(VISUAL_DIAGNOSTIC_CODES.invalidTarget);
    const oob = reduceVisualDocument(
      document,
      { type: "MoveNode", nodeId: field.id, targetParentId: groupNode.id, targetIndex: 99 },
      allocator,
    );
    expect(oob.ok).toBe(false);
    if (oob.ok) {
      return;
    }
    expect(oob.document).toBe(document);
    expect(oob.diagnostics[0]?.code.startsWith("playground.visual.")).toBe(true);
    const extra = add(document, "number", allocator, groupNode.id);
    expect(extra.ok).toBe(true);
    if (!extra.ok) {
      return;
    }
    const moved = reduceVisualDocument(
      extra.document,
      {
        type: "MoveNode",
        nodeId: extra.suggestedSelection,
        targetParentId: groupNode.id,
        targetIndex: 0,
      },
      allocator,
    );
    expect(moved.ok).toBe(true);
    if (!moved.ok) {
      return;
    }
    const parent = findNode(moved.document, groupNode.id);
    expect(parent?.kind).toBe("group");
    if (parent === undefined || parent.kind !== "group") {
      return;
    }
    expect(parent.children[0]?.id).toBe(extra.suggestedSelection);
    expect(parent.children[1]?.kind).toBe("field");
  });

  test("VSE-DUPLICATE-KEY UpdateField rejects duplicate key, empty select, and invalid default", () => {
    const allocator = createVisualIdAllocator();
    const first = add(createEmptyVisualDocument(), "text", allocator);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const second = add(first.document, "select", allocator);
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    const country = second.document.root.children[0];
    const other = second.document.root.children[1];
    if (country === undefined || country.kind !== "field" || other === undefined || other.kind !== "field") {
      return;
    }
    const renameCountry: UpdateFieldCommand = {
      type: "UpdateField",
      nodeId: country.id,
      key: "country",
      required: false,
      widget: "text",
      schemaType: "string",
    };
    const renamed = reduceVisualDocument(second.document, renameCountry, allocator);
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) {
      return;
    }
    const duplicate = reduceVisualDocument(
      renamed.document,
      {
        type: "UpdateField",
        nodeId: other.id,
        key: "country",
        required: false,
        widget: "select",
        schemaType: "string",
        enumValues: ["a"],
      },
      allocator,
    );
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) {
      return;
    }
    expect(duplicate.document).toBe(renamed.document);
    expect(duplicate.diagnostics[0]?.code).toBe(VISUAL_DIAGNOSTIC_CODES.duplicateKey);
    const emptyEnum = reduceVisualDocument(
      renamed.document,
      {
        type: "UpdateField",
        nodeId: other.id,
        key: "role",
        required: false,
        widget: "select",
        schemaType: "string",
        enumValues: [],
      },
      allocator,
    );
    expect(emptyEnum.ok).toBe(false);
    if (!emptyEnum.ok) {
      expect(emptyEnum.document).toBe(renamed.document);
    }
    const badDefault = reduceVisualDocument(
      renamed.document,
      {
        type: "UpdateField",
        nodeId: other.id,
        key: "role",
        required: false,
        widget: "select",
        schemaType: "string",
        enumValues: ["a"],
        defaultValue: "missing",
      },
      allocator,
    );
    expect(badDefault.ok).toBe(false);
    if (!badDefault.ok) {
      expect(badDefault.document).toBe(renamed.document);
    }
    const requiredSelect = reduceVisualDocument(
      renamed.document,
      {
        type: "UpdateField",
        nodeId: other.id,
        key: "role",
        title: "角色",
        required: true,
        widget: "select",
        schemaType: "string",
        enumValues: ["admin", "user"],
        defaultValue: "user",
      },
      allocator,
    );
    expect(requiredSelect.ok).toBe(true);
  });

  test("UpdateLayout maps stack/row/grid and rejects illegal columns/span", () => {
    const allocator = createVisualIdAllocator();
    const added = add(createEmptyVisualDocument(), "grid", allocator);
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    const layout = added.document.root.children[0];
    expect(layout?.kind).toBe("layout");
    if (layout === undefined || layout.kind !== "layout") {
      return;
    }
    const ok = reduceVisualDocument(added.document, { type: "UpdateLayout", nodeId: layout.id, columns: 4 }, allocator);
    expect(ok.ok).toBe(true);
    const stack = add(createEmptyVisualDocument(), "stack", allocator);
    expect(stack.ok).toBe(true);
    if (!stack.ok) {
      return;
    }
    const stackNode = stack.document.root.children[0];
    if (stackNode === undefined || stackNode.kind !== "layout") {
      return;
    }
    const illegalColumns = reduceVisualDocument(
      stack.document,
      { type: "UpdateLayout", nodeId: stackNode.id, columns: 3 },
      allocator,
    );
    expect(illegalColumns.ok).toBe(false);
    if (!illegalColumns.ok) {
      expect(illegalColumns.document).toBe(stack.document);
    }
    const fieldAdd = add(added.document, "text", allocator, layout.id);
    expect(fieldAdd.ok).toBe(true);
    if (!fieldAdd.ok) {
      return;
    }
    const field = findNode(fieldAdd.document, fieldAdd.suggestedSelection);
    if (field === undefined || field.kind !== "field") {
      return;
    }
    const illegalSpan = reduceVisualDocument(
      fieldAdd.document,
      {
        type: "UpdateField",
        nodeId: field.id,
        key: field.key,
        required: false,
        widget: "text",
        schemaType: "string",
        span: 8,
      },
      allocator,
    );
    expect(illegalSpan.ok).toBe(false);
    if (!illegalSpan.ok) {
      expect(illegalSpan.document).toBe(fieldAdd.document);
    }
  });

  test("dragResultToCommand produces AddNode or MoveNode", () => {
    expect(
      dragResultToCommand({
        source: { kind: "palette", palette: "text" },
        targetParentId: ROOT_EDITOR_NODE_ID,
        targetIndex: 0,
      }),
    ).toEqual({ type: "AddNode", parentId: ROOT_EDITOR_NODE_ID, index: 0, palette: "text" });
  });
});
