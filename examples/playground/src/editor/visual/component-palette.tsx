import { DragDropProvider, DragOverlay, useDraggable } from "@dnd-kit/react";
import type { PaletteKind } from "@xunserver-jsf/example-shared";
import { PALETTE_ITEMS } from "@xunserver-jsf/example-shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ComponentPalette({
  onAdd,
}: {
  readonly onAdd: (kind: PaletteKind) => void;
}) {
  return (
    <nav aria-label="组件面板" data-testid="visual-palette" className="flex h-full min-h-0 flex-col gap-2 p-3">
      <p className="text-sm font-medium">组件</p>
      <ul className="flex flex-col gap-1">
        {PALETTE_ITEMS.map((item) => (
          <li key={item.kind}>
            <PaletteItem kind={item.kind} label={item.label} onAdd={onAdd} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PaletteItem({
  kind,
  label,
  onAdd,
}: {
  readonly kind: PaletteKind;
  readonly label: string;
  readonly onAdd: (kind: PaletteKind) => void;
}) {
  const { ref, isDragging } = useDraggable({
    id: `palette:${kind}`,
    data: { source: "palette", palette: kind },
  });
  return (
    <div className="flex gap-1">
      <button
        type="button"
        ref={ref}
        data-palette-kind={kind}
        className={cn(
          "flex-1 rounded-md border px-2 py-1.5 text-left text-sm hover:bg-muted",
          isDragging && "opacity-60",
        )}
        aria-label={`拖拽添加${label}`}
      >
        {label}
      </button>
      <Button type="button" size="sm" variant="outline" aria-label={`添加${label}`} onClick={() => onAdd(kind)}>
        添加
      </Button>
    </div>
  );
}

export function VisualDragOverlay() {
  return (
    <DragOverlay className="rounded-md border bg-background px-2 py-1 text-sm shadow-md" data-testid="visual-drag-overlay">
      {(source) => {
        const data = source.data as { palette?: string } | undefined;
        return <span>{typeof data?.palette === "string" ? data.palette : "节点"}</span>;
      }}
    </DragOverlay>
  );
}

export { DragDropProvider };
