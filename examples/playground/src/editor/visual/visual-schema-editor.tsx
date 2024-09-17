import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/react";
import type {
  EditorNodeId,
  PaletteKind,
  PlaygroundSnapshot,
  VisualCommand,
  VisualDocument,
  VisualEditorDiagnostic,
  WorkbenchDocument,
} from "@xunserver-jsf/example-shared";
import {
  ROOT_EDITOR_NODE_ID,
  commitVisualIfFresh,
  createVisualIdAllocator,
  dragResultToCommand,
  emptySupportedDefinitionTexts,
  exportVisualDefinitionTexts,
  exportWorkbenchSnapshots,
  findNode,
  importVisualDocument,
  isContainerNode,
  reduceVisualDocument,
  visualSourceKey,
} from "@xunserver-jsf/example-shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { copyTextToClipboard, downloadUtf8Json } from "./clipboard";
import { ComponentPalette, DragDropProvider, VisualDragOverlay } from "./component-palette";
import { DesignCanvas } from "./design-canvas";
import { AuthoringDiagnostics } from "./diagnostics-panel";
import { PropertyInspector } from "./property-inspector";

type EditorPanel = "palette" | "canvas" | "inspector";

export function VisualSchemaEditor({
  workbench,
  snapshot,
  onReplaceDefinition,
}: {
  readonly workbench: WorkbenchDocument;
  readonly snapshot: PlaygroundSnapshot;
  readonly onReplaceDefinition: (input: { readonly schemaText: string; readonly uiSchemaText: string }) => void;
}) {
  const allocatorRef = useRef(createVisualIdAllocator());
  const emptyRef = useRef<HTMLButtonElement | null>(null);
  const sessionKeyRef = useRef("");
  const [sessionKey, setSessionKey] = useState("");
  const [visualDocument, setVisualDocument] = useState<VisualDocument | null>(null);
  const [importDiagnostics, setImportDiagnostics] = useState<readonly VisualEditorDiagnostic[]>([]);
  const [commandDiagnostics, setCommandDiagnostics] = useState<readonly VisualEditorDiagnostic[]>([]);
  const [selectedId, setSelectedId] = useState<EditorNodeId | null>(ROOT_EDITOR_NODE_ID);
  const [moveMode, setMoveMode] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [panel, setPanel] = useState<EditorPanel>("canvas");
  const [confirmNew, setConfirmNew] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const sourceKey = visualSourceKey(workbench.schemaText, workbench.uiSchemaText);

  useEffect(() => {
    if (sourceKey === sessionKeyRef.current) {
      return;
    }
    const imported = importVisualDocument(workbench.schemaText, workbench.uiSchemaText);
    sessionKeyRef.current = sourceKey;
    setSessionKey(sourceKey);
    setCommandDiagnostics([]);
    setMoveMode(false);
    if (!imported.ok) {
      setVisualDocument(null);
      setImportDiagnostics(imported.diagnostics);
      setSelectedId(null);
      return;
    }
    allocatorRef.current = imported.allocator;
    setVisualDocument(imported.document);
    setImportDiagnostics([]);
    setSelectedId(ROOT_EDITOR_NODE_ID);
  }, [sourceKey, workbench.schemaText, workbench.uiSchemaText]);

  const inspectorDirty = commandDiagnostics.length > 0;
  const exportBlockedReason = useMemo(() => {
    if (visualDocument === null || importDiagnostics.length > 0) {
      return "当前文档不能可视化导出";
    }
    if (inspectorDirty) {
      return "存在未提交的属性错误";
    }
    if (snapshot.status === "error" || snapshot.broadcastDocument === null) {
      return "当前 workbench 编译失败";
    }
    return null;
  }, [visualDocument, importDiagnostics.length, inspectorDirty, snapshot.broadcastDocument, snapshot.status]);

  const focusNode = (id: EditorNodeId): void => {
    requestAnimationFrame(() => {
      const target = globalThis.document.querySelector(`[data-editor-node-id="${id}"]`);
      if (target instanceof HTMLElement) {
        target.focus();
      } else {
        emptyRef.current?.focus();
      }
    });
  };

  const applyCommand = (command: VisualCommand): boolean => {
    if (visualDocument === null) {
      return false;
    }
    const fresh = commitVisualIfFresh({
      sessionKey,
      schemaText: workbench.schemaText,
      uiSchemaText: workbench.uiSchemaText,
    });
    if (!fresh.ok) {
      setCommandDiagnostics(fresh.diagnostics);
      setAnnouncement("可视化会话已过期，已阻止覆盖");
      return false;
    }
    const result = reduceVisualDocument(visualDocument, command, allocatorRef.current);
    if (!result.ok) {
      setCommandDiagnostics(result.diagnostics);
      setAnnouncement(result.diagnostics[0]?.message ?? "操作失败");
      focusNode(selectedId ?? ROOT_EDITOR_NODE_ID);
      return false;
    }
    const texts = exportVisualDefinitionTexts(result.document);
    const nextKey = visualSourceKey(texts.schemaText, texts.uiSchemaText);
    sessionKeyRef.current = nextKey;
    setVisualDocument(result.document);
    setCommandDiagnostics([]);
    setSelectedId(result.suggestedSelection);
    setSessionKey(nextKey);
    onReplaceDefinition(texts);
    setAnnouncement("已更新可视化文档");
    focusNode(result.suggestedSelection);
    return true;
  };

  const addPalette = (kind: PaletteKind): void => {
    const parentId = resolveInsertParent(visualDocument, selectedId);
    const parent = visualDocument === null ? undefined : findNode(visualDocument, parentId);
    const index = parent !== undefined && isContainerNode(parent) ? parent.children.length : 0;
    applyCommand({ type: "AddNode", parentId, index, palette: kind });
  };

  const onDragEnd = (event: DragEndEvent): void => {
    if (event.canceled || visualDocument === null) {
      return;
    }
    const sourceData = event.operation.source?.data as
      | { source?: string; palette?: PaletteKind; nodeId?: EditorNodeId }
      | undefined;
    const targetData = event.operation.target?.data as
      | { source?: string; parentId?: EditorNodeId; index?: number }
      | undefined;
    if (sourceData === undefined || targetData?.parentId === undefined || targetData.index === undefined) {
      return;
    }
    const command = dragResultToCommand({
      source:
        sourceData.source === "palette" && sourceData.palette !== undefined
          ? { kind: "palette", palette: sourceData.palette }
          : { kind: "node", nodeId: sourceData.nodeId as EditorNodeId },
      targetParentId: targetData.parentId,
      targetIndex: targetData.index,
    });
    applyCommand(command);
  };

  if (visualDocument === null) {
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="visual-unsupported">
        <div className="p-4">
          <p className="text-sm font-medium">当前文档不支持可视化编辑</p>
          <p className="mt-1 text-sm text-muted-foreground">原始五份 workbench 文本保持不变，不会猜测或降级未知内容。</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={() => setConfirmNew(true)}>
              新建可视化文档
            </Button>
          </div>
          {confirmNew ? (
            <div role="alertdialog" aria-labelledby="visual-new-title" className="mt-3 rounded-md border p-3">
              <p id="visual-new-title" className="text-sm">
                确认替换 Schema 与 UI Schema？rules、config 与 formData 将保留。
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    const empty = emptySupportedDefinitionTexts();
                    onReplaceDefinition(empty);
                    setConfirmNew(false);
                  }}
                >
                  确认
                </Button>
                <Button type="button" variant="outline" onClick={() => setConfirmNew(false)}>
                  取消
                </Button>
              </div>
            </div>
          ) : null}
        </div>
        <AuthoringDiagnostics diagnostics={importDiagnostics} />
      </div>
    );
  }

  return (
    <DragDropProvider onDragEnd={onDragEnd}>
      <div className="flex h-full min-h-0 flex-col" data-testid="visual-schema-editor">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b p-2">
          <div className="flex gap-1 md:hidden">
            {(["palette", "canvas", "inspector"] as const).map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={panel === item ? "default" : "outline"}
                aria-pressed={panel === item}
                onClick={() => setPanel(item)}
              >
                {item === "palette" ? "组件" : item === "canvas" ? "画布" : "属性"}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={moveMode ? "default" : "outline"}
              aria-pressed={moveMode}
              onClick={() => setMoveMode((value) => !value)}
            >
              键盘移动
            </Button>
            <ExportButtons
              workbench={workbench}
              disabledReason={exportBlockedReason}
              onMessage={setExportMessage}
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className={cn("w-56 shrink-0 overflow-auto border-r", panel !== "palette" && "max-md:hidden")}>
            <ComponentPalette onAdd={addPalette} />
          </div>
          <div className={cn("min-w-0 flex-1 overflow-auto", panel !== "canvas" && "max-md:hidden")}>
            <DesignCanvas
              document={visualDocument}
              selectedId={selectedId}
              moveMode={moveMode}
              emptyRef={emptyRef}
              onSelect={setSelectedId}
              onDelete={(id) => {
                applyCommand({ type: "RemoveNode", nodeId: id });
                setMoveMode(false);
              }}
              onMoveHere={(parentId, index) => {
                if (selectedId === null || selectedId === ROOT_EDITOR_NODE_ID) {
                  return;
                }
                applyCommand({ type: "MoveNode", nodeId: selectedId, targetParentId: parentId, targetIndex: index });
                setMoveMode(false);
              }}
            />
          </div>
          <div className={cn("w-80 shrink-0 overflow-auto border-l", panel !== "inspector" && "max-md:hidden")}>
            <PropertyInspector
              document={visualDocument}
              selectedId={selectedId}
              diagnostics={commandDiagnostics}
              onApplyField={(command) => applyCommand(command)}
              onApplyGroup={(command) => applyCommand(command)}
              onApplyLayout={(command) => applyCommand(command)}
              onCancel={() => setCommandDiagnostics([])}
            />
          </div>
        </div>
        <AuthoringDiagnostics
          diagnostics={[...importDiagnostics, ...commandDiagnostics]}
          onFocus={(diagnostic) => {
            if (diagnostic.nodeId !== undefined) {
              setSelectedId(diagnostic.nodeId);
              setPanel("inspector");
              focusNode(diagnostic.nodeId);
            }
          }}
        />
        <div aria-live="polite" className="sr-only">
          {announcement}
          {exportMessage}
        </div>
        <VisualDragOverlay />
      </div>
    </DragDropProvider>
  );
}

function ExportButtons({
  workbench,
  disabledReason,
  onMessage,
}: {
  readonly workbench: WorkbenchDocument;
  readonly disabledReason: string | null;
  readonly onMessage: (message: string) => void;
}) {
  const disabled = disabledReason !== null;
  const run = async (kind: "copy-schema" | "copy-ui" | "copy-definition" | "download-schema" | "download-ui" | "download-definition") => {
    if (disabled) {
      onMessage(disabledReason);
      return;
    }
    const snapshot = exportWorkbenchSnapshots(workbench);
    try {
      if (kind === "copy-schema") {
        await copyTextToClipboard(snapshot.schemaText);
      } else if (kind === "copy-ui") {
        await copyTextToClipboard(snapshot.uiSchemaText);
      } else if (kind === "copy-definition") {
        await copyTextToClipboard(snapshot.definitionText);
      } else if (kind === "download-schema") {
        downloadUtf8Json(snapshot.schemaText, snapshot.schemaFileName, snapshot.mimeType);
      } else if (kind === "download-ui") {
        downloadUtf8Json(snapshot.uiSchemaText, snapshot.uiSchemaFileName, snapshot.mimeType);
      } else {
        downloadUtf8Json(snapshot.definitionText, snapshot.definitionFileName, snapshot.mimeType);
      }
      onMessage("导出完成");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "导出失败");
    }
  };
  return (
    <>
      <Button type="button" size="sm" variant="outline" disabled={disabled} title={disabledReason ?? undefined} onClick={() => void run("copy-schema")}>
        复制 Schema
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled} title={disabledReason ?? undefined} onClick={() => void run("copy-ui")}>
        复制 UI Schema
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled} title={disabledReason ?? undefined} onClick={() => void run("copy-definition")}>
        复制完整定义
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled} title={disabledReason ?? undefined} onClick={() => void run("download-schema")}>
        下载 Schema
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={disabled} title={disabledReason ?? undefined} onClick={() => void run("download-definition")}>
        下载完整定义
      </Button>
    </>
  );
}

function resolveInsertParent(document: VisualDocument | null, selectedId: EditorNodeId | null): EditorNodeId {
  if (document === null || selectedId === null) {
    return ROOT_EDITOR_NODE_ID;
  }
  const node = findNode(document, selectedId);
  if (node !== undefined && isContainerNode(node)) {
    return node.id;
  }
  return ROOT_EDITOR_NODE_ID;
}
