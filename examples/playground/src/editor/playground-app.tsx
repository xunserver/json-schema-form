import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createPlaygroundController,
  displayedWorkbenchDiagnostics,
  formatDiagnostics,
  isPreviewToParentMessage,
  listCatalogExamples,
  postToPreview,
  PREVIEW_CHROME,
  WORKBENCH_EDITORS,
  type ParentToPreviewMessage,
  type PreviewId,
} from "@xunserver-jsf/example-shared";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { JsonWorkbenchEditor } from "./json-workbench-editor";
import { usePlaygroundSnapshot } from "./use-playground-snapshot";
import { VisualSchemaEditor } from "./visual/visual-schema-editor";

const PREVIEW_IDS = new Set<string>(PREVIEW_CHROME.map((item) => item.id));

const DOCS_URL = "https://xunserver.github.io/json-schema-form/";
const REPO_URL = "https://github.com/xunserver/json-schema-form";

function isPreviewId(value: string): value is PreviewId {
  return PREVIEW_IDS.has(value);
}

function isEditorKey(
  value: string,
): value is "schema" | "uiSchema" | "rules" | "config" | "formData" {
  return (
    value === "schema" ||
    value === "uiSchema" ||
    value === "rules" ||
    value === "config" ||
    value === "formData"
  );
}

function InspectorField({ title, text }: { readonly title: string; readonly text: string }) {
  return (
    <Field>
      <FieldLabel>{title}</FieldLabel>
      <Textarea readOnly value={text} />
    </Field>
  );
}

function PreviewStage({ children }: { readonly children: ReactNode }) {
  return (
    <section
      aria-labelledby="preview-stage-label"
      className="relative min-h-0 flex-1 bg-muted px-4 pb-4 pt-4"
    >
      <div className="relative size-full min-h-0 rounded-lg border bg-background">
        <div className="relative size-full overflow-hidden rounded-[inherit]">{children}</div>
        <h2
          id="preview-stage-label"
          className="absolute top-0 left-3 -translate-y-[calc(100%-1px)] bg-muted px-1.5 py-0.5 text-xs leading-none font-medium text-muted-foreground"
        >
          {/* 渲染预览 */}
        </h2>
      </div>
    </section>
  );
}

export function PlaygroundApp() {
  const controller = useMemo(() => createPlaygroundController(), []);
  const snapshot = usePlaygroundSnapshot(controller);
  const examples = useMemo(() => listCatalogExamples(), []);
  const framesRef = useRef(new Map<PreviewId, HTMLIFrameElement>());
  const lastBroadcastEpochRef = useRef(-1);
  const [editorMode, setEditorMode] = useState<"text" | "visual">("text");

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  const broadcastDocument = (next = controller.getSnapshot()) => {
    const message: ParentToPreviewMessage = {
      channel: "form-playground-v1",
      type: "document",
      exampleId: next.exampleId,
      document: next.broadcastDocument,
      documentKey: next.documentKey,
    };
    for (const frame of framesRef.current.values()) {
      if (frame.contentWindow !== null) {
        postToPreview(frame.contentWindow, message);
      }
    }
  };

  const sendCommand = (previewId: PreviewId, type: "submit" | "request-inspection") => {
    const frame = framesRef.current.get(previewId);
    if (frame?.contentWindow === null || frame?.contentWindow === undefined) {
      return;
    }
    postToPreview(frame.contentWindow, { channel: "form-playground-v1", type });
  };

  useEffect(() => {
    if (snapshot.documentEpoch !== lastBroadcastEpochRef.current) {
      lastBroadcastEpochRef.current = snapshot.documentEpoch;
      broadcastDocument(snapshot);
    }
    const command = controller.consumePendingCommand();
    if (command !== null) {
      sendCommand(snapshot.focusedPreview, command);
    }
  }, [controller, snapshot.documentEpoch, snapshot.focusedPreview, snapshot]);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!isPreviewToParentMessage(event.data)) {
        return;
      }
      const message = event.data;
      switch (message.type) {
        case "ready":
          broadcastDocument(controller.getSnapshot());
          break;
        case "inspection":
          controller.applyInspection(message);
          break;
        case "submit":
          controller.recordSubmit(message.previewId, message.payload);
          break;
        case "diagnostic":
          controller.recordDiagnostic(message.previewId, message.diagnostic);
          break;
        case "compile-failure":
          controller.recordCompileFailure(message.previewId, message.documentKey, message.diagnostics);
          break;
        default:
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [controller]);

  const focusedLabel =
    PREVIEW_CHROME.find((item) => item.id === snapshot.focusedPreview)?.label ?? snapshot.focusedPreview;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <CardTitle>JSON Schema Form</CardTitle>
          <CardDescription>多适配器演练场</CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <a className={buttonVariants({ variant: "outline" })} href={DOCS_URL}>
            文档
          </a>
          <a className={buttonVariants({ variant: "outline" })} href={REPO_URL} target="_blank" rel="noreferrer">
            仓库
          </a>
          <Field orientation="horizontal" className="w-auto">
            <FieldLabel htmlFor="playground-editor-mode">编辑模式</FieldLabel>
            <Tabs
              value={editorMode}
              onValueChange={(value) => {
                if (value === "text" || value === "visual") {
                  setEditorMode(value);
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="text">文本</TabsTrigger>
                <TabsTrigger value="visual">可视化</TabsTrigger>
              </TabsList>
            </Tabs>
          </Field>
          <Field orientation="horizontal" className="w-auto">
            <FieldLabel htmlFor="playground-example">示例</FieldLabel>
            <Select
              value={snapshot.exampleId}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  controller.setExample(value);
                }
              }}
            >
              <SelectTrigger id="playground-example" aria-label="示例">
                <SelectValue>
                  {examples.find((example) => example.id === snapshot.exampleId)?.title ?? snapshot.exampleId}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="end">
                <SelectGroup>
                  {examples.map((example) => (
                    <SelectItem key={example.id} value={example.id}>
                      {example.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Badge variant={snapshot.status === "ok" ? "secondary" : "destructive"}>
            {snapshot.statusMessage}
          </Badge>
        </div>
      </header>

      <Separator />

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize="38%" minSize="24%" className="min-h-0">
          {editorMode === "visual" ? (
            <VisualSchemaEditor
              workbench={snapshot.workbench}
              snapshot={snapshot}
              onReplaceDefinition={(input) => {
                controller.replaceDefinitionTexts(input);
              }}
            />
          ) : (
          <Tabs
            value={snapshot.activeTab}
            onValueChange={(value) => {
              if (isEditorKey(value)) {
                controller.setActiveTab(value);
              }
            }}
            className="flex h-full min-h-0 flex-col gap-0"
          >
            <div className="p-4">
              <TabsList>
                {WORKBENCH_EDITORS.map((editor) => (
                  <TabsTrigger key={editor.id} value={editor.id}>
                    {editor.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="min-h-0 flex-1">
              <JsonWorkbenchEditor
                activeTab={snapshot.activeTab}
                value={snapshot.editorText}
                onChange={(text) => {
                  controller.setEditorText(text);
                }}
              />
            </div>
          </Tabs>
          )}
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="62%" minSize="36%" className="min-h-0">
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="58%" minSize="28%" className="min-h-0">
              <Tabs
                value={snapshot.focusedPreview}
                onValueChange={(value) => {
                  if (isPreviewId(value)) {
                    controller.setFocusedPreview(value);
                  }
                }}
                className="flex h-full min-h-0 flex-col gap-0"
              >
                <div className="bg-background px-4 pt-4 pb-3">
                  <TabsList>
                    {PREVIEW_CHROME.map((chrome) => (
                      <TabsTrigger key={chrome.id} value={chrome.id}>
                        {chrome.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                <PreviewStage>
                  {PREVIEW_CHROME.map((chrome) => {
                    const active = chrome.id === snapshot.focusedPreview;
                    return (
                      <div
                        key={chrome.id}
                        className={cn("absolute inset-0", !active && "pointer-events-none invisible")}
                        aria-hidden={!active}
                      >
                        <iframe
                          title={chrome.label}
                          src={chrome.href}
                          className="size-full"
                          loading="eager"
                          ref={(node) => {
                            if (node === null) {
                              framesRef.current.delete(chrome.id);
                              return;
                            }
                            framesRef.current.set(chrome.id, node);
                          }}
                          onLoad={() => {
                            broadcastDocument(controller.getSnapshot());
                          }}
                        />
                      </div>
                    );
                  })}
                </PreviewStage>
              </Tabs>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize="42%" minSize="24%" className="min-h-0">
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div>
                    <CardTitle>检查器</CardTitle>
                    <CardDescription>当前：{focusedLabel}</CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        controller.requestSyncFromLive();
                      }}
                    >
                      将实时值写入 formData
                    </Button>
                    <Button
                      type="button"
                      disabled={snapshot.broadcastDocument === null}
                      onClick={() => {
                        controller.requestSubmit();
                      }}
                    >
                      提交当前预览
                    </Button>
                  </div>
                </div>
                <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
                  <FieldGroup>
                    <InspectorField
                      title="编译 / 解析诊断"
                      text={formatDiagnostics(displayedWorkbenchDiagnostics(snapshot))}
                    />
                    <InspectorField
                      title="运行时 / 适配器诊断"
                      text={formatDiagnostics(snapshot.runtimeDiagnostics)}
                    />
                    <InspectorField
                      title="实时值"
                      text={
                        snapshot.liveValues === null ? "null" : JSON.stringify(snapshot.liveValues, null, 2)
                      }
                    />
                    <InspectorField
                      title="serialize()"
                      text={
                        snapshot.serialized === null ? "null" : JSON.stringify(snapshot.serialized, null, 2)
                      }
                    />
                    <InspectorField
                      title="最近一次提交数据"
                      text={
                        snapshot.lastSubmit === null ? "null" : JSON.stringify(snapshot.lastSubmit, null, 2)
                      }
                    />
                  </FieldGroup>
                </ScrollArea>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
