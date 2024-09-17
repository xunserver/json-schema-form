export type EditorNodeId = string & { readonly __brand: "EditorNodeId" };

export const ROOT_EDITOR_NODE_ID = "enode-root" as EditorNodeId;

export type FieldPalette = "text" | "textarea" | "number" | "boolean" | "select";
export type LayoutVariant = "stack" | "row" | "grid";
export type PaletteKind = FieldPalette | "group" | LayoutVariant;
export type VisualWidget = "text" | "textarea" | "number" | "checkbox" | "switch" | "select";
export type VisualSchemaType = "string" | "number" | "integer" | "boolean";

export interface VisualIdAllocator {
  next(): EditorNodeId;
  peek(): number;
}

export interface VisualFieldConstraints {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly multipleOf?: number;
}

export interface VisualFieldNode {
  readonly id: EditorNodeId;
  readonly kind: "field";
  readonly palette: FieldPalette;
  readonly key: string;
  readonly title?: string;
  readonly description?: string;
  readonly required: boolean;
  readonly widget: VisualWidget;
  readonly schemaType: VisualSchemaType;
  readonly defaultValue?: unknown;
  readonly enumValues?: readonly string[];
  readonly constraints?: VisualFieldConstraints;
  readonly visible?: boolean;
  readonly disabled?: boolean;
  readonly readonly?: boolean;
  readonly span?: number;
}

export interface VisualGroupNode {
  readonly id: EditorNodeId;
  readonly kind: "group";
  readonly children: readonly VisualNode[];
  readonly span?: number;
}

export interface VisualLayoutNode {
  readonly id: EditorNodeId;
  readonly kind: "layout";
  readonly variant: LayoutVariant;
  readonly columns: number;
  readonly children: readonly VisualNode[];
  readonly span?: number;
}

export type VisualNode = VisualFieldNode | VisualGroupNode | VisualLayoutNode;

export interface VisualRootNode {
  readonly id: EditorNodeId;
  readonly kind: "root";
  readonly title?: string;
  readonly description?: string;
  readonly children: readonly VisualNode[];
}

export interface VisualDocument {
  readonly version: 1;
  readonly root: VisualRootNode;
}

export type VisualContainerNode = VisualRootNode | VisualGroupNode | VisualLayoutNode;

export const PALETTE_ITEMS: readonly { readonly kind: PaletteKind; readonly label: string }[] = Object.freeze([
  Object.freeze({ kind: "text", label: "文本" }),
  Object.freeze({ kind: "textarea", label: "长文本" }),
  Object.freeze({ kind: "number", label: "数字" }),
  Object.freeze({ kind: "boolean", label: "布尔" }),
  Object.freeze({ kind: "select", label: "单选" }),
  Object.freeze({ kind: "group", label: "分组" }),
  Object.freeze({ kind: "stack", label: "纵向" }),
  Object.freeze({ kind: "row", label: "横向" }),
  Object.freeze({ kind: "grid", label: "网格" }),
]);

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isModelPathSafeKey(key: string): boolean {
  return IDENT.test(key);
}

export function asEditorNodeId(value: string): EditorNodeId {
  return value as EditorNodeId;
}

export function createVisualIdAllocator(start = 1): VisualIdAllocator {
  let current = start;
  return {
    next() {
      const id = asEditorNodeId(`enode-${current}`);
      current += 1;
      return id;
    },
    peek() {
      return current;
    },
  };
}

export function freezeVisualDocument(document: VisualDocument): VisualDocument {
  freezeDeep(document);
  return document;
}

export function createEmptyVisualDocument(): VisualDocument {
  return freezeVisualDocument({
    version: 1,
    root: {
      id: ROOT_EDITOR_NODE_ID,
      kind: "root",
      children: [],
    },
  });
}

export function cloneVisualDocument(document: VisualDocument): VisualDocument {
  return JSON.parse(JSON.stringify(document)) as VisualDocument;
}

export function collectFieldNodes(document: VisualDocument): readonly VisualFieldNode[] {
  const fields: VisualFieldNode[] = [];
  walkNodes(document.root.children, (node) => {
    if (node.kind === "field") {
      fields.push(node);
    }
  });
  return fields;
}

export function collectFieldKeys(document: VisualDocument): readonly string[] {
  return collectFieldNodes(document).map((node) => node.key);
}

export function findNode(document: VisualDocument, id: EditorNodeId): VisualNode | VisualRootNode | undefined {
  if (document.root.id === id) {
    return document.root;
  }
  let found: VisualNode | undefined;
  walkNodes(document.root.children, (node) => {
    if (node.id === id) {
      found = node;
    }
  });
  return found;
}

export function findParent(
  document: VisualDocument,
  id: EditorNodeId,
): { readonly parent: VisualContainerNode; readonly index: number } | undefined {
  return findParentIn(document.root, id);
}

export function isContainerNode(node: VisualNode | VisualRootNode): node is VisualContainerNode {
  return node.kind === "root" || node.kind === "group" || node.kind === "layout";
}

export function isDescendant(container: VisualContainerNode, maybeChildId: EditorNodeId): boolean {
  if (container.id === maybeChildId) {
    return true;
  }
  let found = false;
  walkNodes(container.children, (node) => {
    if (node.id === maybeChildId) {
      found = true;
    }
  });
  return found;
}

export function parentLayoutColumns(document: VisualDocument, nodeId: EditorNodeId): number | undefined {
  const located = findParent(document, nodeId);
  if (located === undefined) {
    return undefined;
  }
  if (located.parent.kind === "layout") {
    return located.parent.columns;
  }
  return undefined;
}

export function nextUniqueKey(existing: ReadonlySet<string>, base: string): string {
  if (!existing.has(base) && isModelPathSafeKey(base)) {
    return base;
  }
  let index = 1;
  while (existing.has(`${base}_${index}`)) {
    index += 1;
  }
  return `${base}_${index}`;
}

export function createPaletteNode(
  kind: PaletteKind,
  allocator: VisualIdAllocator,
  existingKeys: ReadonlySet<string> = new Set(),
): VisualNode {
  const id = allocator.next();
  switch (kind) {
    case "text":
      return {
        id,
        kind: "field",
        palette: "text",
        key: nextUniqueKey(existingKeys, "text"),
        required: false,
        widget: "text",
        schemaType: "string",
      };
    case "textarea":
      return {
        id,
        kind: "field",
        palette: "textarea",
        key: nextUniqueKey(existingKeys, "textarea"),
        required: false,
        widget: "textarea",
        schemaType: "string",
      };
    case "number":
      return {
        id,
        kind: "field",
        palette: "number",
        key: nextUniqueKey(existingKeys, "number"),
        required: false,
        widget: "number",
        schemaType: "number",
      };
    case "boolean":
      return {
        id,
        kind: "field",
        palette: "boolean",
        key: nextUniqueKey(existingKeys, "flag"),
        required: false,
        widget: "checkbox",
        schemaType: "boolean",
      };
    case "select":
      return {
        id,
        kind: "field",
        palette: "select",
        key: nextUniqueKey(existingKeys, "select"),
        required: false,
        widget: "select",
        schemaType: "string",
        enumValues: ["option1"],
      };
    case "group":
      return { id, kind: "group", children: [] };
    case "stack":
      return { id, kind: "layout", variant: "stack", columns: 1, children: [] };
    case "row":
      return { id, kind: "layout", variant: "row", columns: 2, children: [] };
    case "grid":
      return { id, kind: "layout", variant: "grid", columns: 3, children: [] };
  }
}

export function walkNodes(nodes: readonly VisualNode[], visit: (node: VisualNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if (node.kind !== "field") {
      walkNodes(node.children, visit);
    }
  }
}

export function suggestedSelectionAfterRemove(
  parent: VisualContainerNode,
  removedIndex: number,
): EditorNodeId {
  const next = parent.children[removedIndex];
  if (next !== undefined) {
    return next.id;
  }
  const previous = parent.children[removedIndex - 1];
  if (previous !== undefined) {
    return previous.id;
  }
  return parent.id;
}

function findParentIn(
  container: VisualContainerNode,
  id: EditorNodeId,
): { readonly parent: VisualContainerNode; readonly index: number } | undefined {
  const index = container.children.findIndex((child) => child.id === id);
  if (index >= 0) {
    return { parent: container, index };
  }
  for (const child of container.children) {
    if (child.kind === "field") {
      continue;
    }
    const nested = findParentIn(child, id);
    if (nested !== undefined) {
      return nested;
    }
  }
  return undefined;
}

function freezeDeep(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      freezeDeep(item);
    }
    return;
  }
  for (const nested of Object.values(value)) {
    freezeDeep(nested);
  }
}
