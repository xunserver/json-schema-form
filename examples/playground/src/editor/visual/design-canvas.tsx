import type { RefObject } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/react";
import type { EditorNodeId, VisualDocument, VisualNode, VisualRootNode } from "@xunserver-jsf/example-shared";
import { ROOT_EDITOR_NODE_ID } from "@xunserver-jsf/example-shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DesignCanvas({
  document,
  selectedId,
  moveMode,
  onSelect,
  onDelete,
  onMoveHere,
  emptyRef,
}: {
  readonly document: VisualDocument;
  readonly selectedId: EditorNodeId | null;
  readonly moveMode: boolean;
  readonly onSelect: (id: EditorNodeId) => void;
  readonly onDelete: (id: EditorNodeId) => void;
  readonly onMoveHere: (parentId: EditorNodeId, index: number) => void;
  readonly emptyRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <section aria-label="设计画布" data-testid="visual-canvas" className="flex h-full min-h-0 flex-col gap-2 p-3">
      <p className="text-sm font-medium">画布</p>
      {document.root.children.length === 0 ? (
        <button
          ref={emptyRef}
          type="button"
          data-editor-node-id={ROOT_EDITOR_NODE_ID}
          className="rounded-md border border-dashed px-3 py-8 text-sm text-muted-foreground"
          onClick={() => onSelect(ROOT_EDITOR_NODE_ID)}
        >
          从组件面板添加字段
        </button>
      ) : (
        <CanvasContainer
          node={document.root}
          selectedId={selectedId}
          moveMode={moveMode}
          onSelect={onSelect}
          onDelete={onDelete}
          onMoveHere={onMoveHere}
        />
      )}
    </section>
  );
}

function CanvasContainer({
  node,
  selectedId,
  moveMode,
  onSelect,
  onDelete,
  onMoveHere,
}: {
  readonly node: VisualRootNode | Extract<VisualNode, { kind: "group" | "layout" }>;
  readonly selectedId: EditorNodeId | null;
  readonly moveMode: boolean;
  readonly onSelect: (id: EditorNodeId) => void;
  readonly onDelete: (id: EditorNodeId) => void;
  readonly onMoveHere: (parentId: EditorNodeId, index: number) => void;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: `container:${node.id}`,
    data: { source: "container", parentId: node.id, index: node.children.length },
  });
  const selected = selectedId === node.id;
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1 rounded-md border p-2", isDropTarget && "ring-2 ring-ring", selected && "bg-muted/60")}
    >
      {node.kind !== "root" ? (
        <CanvasHeading
          node={node}
          selected={selected}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ) : (
        <p className="text-xs text-muted-foreground">根对象</p>
      )}
      {node.children.map((child, index) => (
        <div key={child.id} className="flex flex-col gap-1">
          <DropSlot parentId={node.id} index={index} moveMode={moveMode} onMoveHere={onMoveHere} />
          {child.kind === "field" ? (
            <FieldCard
              node={child}
              selected={selectedId === child.id}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ) : (
            <CanvasContainer
              node={child}
              selectedId={selectedId}
              moveMode={moveMode}
              onSelect={onSelect}
              onDelete={onDelete}
              onMoveHere={onMoveHere}
            />
          )}
        </div>
      ))}
      <DropSlot parentId={node.id} index={node.children.length} moveMode={moveMode} onMoveHere={onMoveHere} />
    </div>
  );
}

function DropSlot({
  parentId,
  index,
  moveMode,
  onMoveHere,
}: {
  readonly parentId: EditorNodeId;
  readonly index: number;
  readonly moveMode: boolean;
  readonly onMoveHere: (parentId: EditorNodeId, index: number) => void;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: `slot:${parentId}:${index}`,
    data: { source: "slot", parentId, index },
  });
  return (
    <div ref={ref} className={cn("min-h-2 rounded", isDropTarget && "bg-primary/20")}>
      {moveMode ? (
        <Button type="button" size="xs" variant="ghost" onClick={() => onMoveHere(parentId, index)}>
          放到这里
        </Button>
      ) : null}
    </div>
  );
}

function CanvasHeading({
  node,
  selected,
  onSelect,
  onDelete,
}: {
  readonly node: Extract<VisualNode, { kind: "group" | "layout" }>;
  readonly selected: boolean;
  readonly onSelect: (id: EditorNodeId) => void;
  readonly onDelete: (id: EditorNodeId) => void;
}) {
  const { ref, isDragging } = useDraggable({
    id: node.id,
    data: { source: "node", nodeId: node.id },
  });
  const label =
    node.kind === "group"
      ? node.title?.trim() || "分组"
      : node.variant === "stack"
        ? "纵向"
        : node.variant === "row"
          ? "横向"
          : "网格";
  return (
    <div className="flex items-center justify-between gap-2">
      <button
        ref={ref}
        type="button"
        data-editor-node-id={node.id}
        aria-pressed={selected}
        className={cn("text-left text-sm font-medium", isDragging && "opacity-60")}
        onClick={() => onSelect(node.id)}
      >
        {label}
      </button>
      <Button type="button" size="xs" variant="ghost" aria-label={`删除${label}`} onClick={() => onDelete(node.id)}>
        删除
      </Button>
    </div>
  );
}

function FieldCard({
  node,
  selected,
  onSelect,
  onDelete,
}: {
  readonly node: Extract<VisualNode, { kind: "field" }>;
  readonly selected: boolean;
  readonly onSelect: (id: EditorNodeId) => void;
  readonly onDelete: (id: EditorNodeId) => void;
}) {
  const { ref, isDragging } = useDraggable({
    id: node.id,
    data: { source: "node", nodeId: node.id },
  });
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-md border bg-background px-2 py-1.5",
        selected && "ring-2 ring-ring",
        isDragging && "opacity-60",
      )}
    >
      <button
        ref={ref}
        type="button"
        data-editor-node-id={node.id}
        aria-pressed={selected}
        className="flex-1 text-left text-sm"
        onClick={() => onSelect(node.id)}
      >
        {node.widget} · {node.key}
      </button>
      <Button type="button" size="xs" variant="ghost" aria-label={`删除字段 ${node.key}`} onClick={() => onDelete(node.id)}>
        删除
      </Button>
    </div>
  );
}
