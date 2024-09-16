import type { Diagnostic, JsonValue } from "@form/core";
import { exampleToDocument, getCatalogExample, readExampleFromUrl, writeExampleToUrl } from "./catalog.js";
import { createDemoEnvironment } from "./environment.js";
import type { PreviewId, WorkbenchDocument, WorkbenchFailureStage } from "./types.js";
import {
  diagnoseWorkbenchDocument,
  type EditorKey,
  planWorkbenchCompile,
  WORKBENCH_EDITORS,
  workbenchDocumentKey,
} from "./workbench.js";

const DEBOUNCE_MS = 300;

const FAILURE_STAGE_LABEL: Record<WorkbenchFailureStage, string> = {
  parse: "解析",
  define: "定义",
  compile: "编译",
  create: "创建",
};

export interface PlaygroundSnapshot {
  readonly exampleId: string;
  readonly activeTab: EditorKey;
  readonly workbench: WorkbenchDocument;
  readonly editorText: string;
  readonly documentKey: string;
  readonly broadcastDocument: WorkbenchDocument | null;
  readonly focusedPreview: PreviewId;
  readonly compileDiagnostics: readonly Diagnostic[];
  readonly failureDiagnostics: readonly Diagnostic[];
  readonly runtimeDiagnostics: readonly Diagnostic[];
  readonly liveValues: JsonValue | null;
  readonly serialized: JsonValue | null;
  readonly lastSubmit: JsonValue | null;
  readonly status: "ok" | "error";
  readonly statusMessage: string;
  readonly documentEpoch: number;
}

export interface PlaygroundController {
  getSnapshot(): PlaygroundSnapshot;
  subscribe(listener: () => void): () => void;
  setActiveTab(tab: EditorKey): void;
  setEditorText(value: string): void;
  setExample(id: string): void;
  setFocusedPreview(id: PreviewId): void;
  requestSubmit(): void;
  requestSyncFromLive(): void;
  applyInspection(input: {
    readonly previewId: PreviewId;
    readonly documentKey: string;
    readonly liveValues: JsonValue | null;
    readonly serialized: JsonValue | null;
    readonly runtimeDiagnostics: readonly Diagnostic[];
  }): void;
  recordSubmit(previewId: PreviewId, payload: JsonValue): void;
  recordDiagnostic(previewId: PreviewId, diagnostic: Diagnostic): void;
  recordCompileFailure(previewId: PreviewId, documentKey: string, diagnostics: readonly Diagnostic[]): void;
  consumePendingCommand(): "submit" | "request-inspection" | null;
  dispose(): void;
}

export function displayedWorkbenchDiagnostics(snapshot: PlaygroundSnapshot): readonly Diagnostic[] {
  return snapshot.failureDiagnostics.length > 0 ? snapshot.failureDiagnostics : snapshot.compileDiagnostics;
}

export function createPlaygroundController(): PlaygroundController {
  const environment = createDemoEnvironment();
  const listeners = new Set<() => void>();

  let exampleId = readExampleFromUrl();
  const initialExample = getCatalogExample(exampleId);
  if (initialExample === undefined) {
    throw new Error("default catalog example is missing");
  }

  let activeTab: EditorKey = "schema";
  let workbench = exampleToDocument(initialExample);
  let focusedPreview: PreviewId = "element-plus";
  let documentKey = workbenchDocumentKey(workbench);
  let broadcastDocument: WorkbenchDocument | null = workbench;
  let documentEpoch = 0;
  let compileDiagnostics: readonly Diagnostic[] = [];
  let failureDiagnostics: readonly Diagnostic[] = [];
  let runtimeDiagnostics: Diagnostic[] = [];
  let liveValues: JsonValue | null = null;
  let serialized: JsonValue | null = null;
  let lastSubmit: JsonValue | null = null;
  let status: "ok" | "error" = "ok";
  let statusMessage = "就绪";
  let lastAppliedKey: string | null = null;
  let hasCompiledOk = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingCommand: "submit" | "request-inspection" | null = null;

  function emit(): void {
    cachedSnapshot = buildSnapshot();
    for (const listener of listeners) {
      listener();
    }
  }

  function buildSnapshot(): PlaygroundSnapshot {
    return {
      exampleId,
      activeTab,
      workbench,
      editorText: workbench[`${activeTab}Text`],
      documentKey,
      broadcastDocument,
      focusedPreview,
      compileDiagnostics,
      failureDiagnostics,
      runtimeDiagnostics,
      liveValues,
      serialized,
      lastSubmit,
      status,
      statusMessage,
      documentEpoch,
    };
  }

  let cachedSnapshot = buildSnapshot();

  function applyDocument(nextDocument: WorkbenchDocument, preserveOnFailure: boolean): void {
    const nextKey = workbenchDocumentKey(nextDocument);
    const result = diagnoseWorkbenchDocument(nextDocument, environment);
    if (result.ok) {
      lastAppliedKey = nextKey;
      documentKey = nextKey;
      broadcastDocument = nextDocument;
      documentEpoch += 1;
      compileDiagnostics = result.diagnostics;
      failureDiagnostics = [];
      runtimeDiagnostics = [];
      liveValues = null;
      serialized = null;
      hasCompiledOk = true;
      status = "ok";
      statusMessage =
        result.diagnostics.length > 0
          ? `已编译，${result.diagnostics.length} 条诊断`
          : "已编译";
      emit();
      return;
    }
    failureDiagnostics = result.diagnostics;
    status = "error";
    statusMessage = `${FAILURE_STAGE_LABEL[result.stage]}失败（${result.diagnostics.length}）`;
    if (!preserveOnFailure) {
      lastAppliedKey = nextKey;
      documentKey = nextKey;
      broadcastDocument = null;
      documentEpoch += 1;
      liveValues = null;
      serialized = null;
      hasCompiledOk = false;
    }
    emit();
  }

  function scheduleCompile(exampleSwitch: boolean): void {
    const plan = planWorkbenchCompile({
      lastAppliedKey,
      nextKey: workbenchDocumentKey(workbench),
      hasForm: hasCompiledOk,
      exampleSwitch,
    });
    if (plan.skip) {
      return;
    }
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const run = () => applyDocument(workbench, plan.preserveFormOnFailure);
    if (plan.immediate) {
      run();
      return;
    }
    debounceTimer = setTimeout(run, DEBOUNCE_MS);
  }

  scheduleCompile(false);

  return {
    getSnapshot: () => cachedSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setActiveTab(tab) {
      if (!WORKBENCH_EDITORS.some((editor) => editor.id === tab)) {
        return;
      }
      activeTab = tab;
      emit();
    },
    setEditorText(value) {
      const key = `${activeTab}Text` as const;
      workbench = { ...workbench, [key]: value };
      scheduleCompile(false);
      emit();
    },
    setExample(id) {
      const example = getCatalogExample(id);
      if (example === undefined) {
        return;
      }
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      exampleId = id;
      writeExampleToUrl(id);
      lastSubmit = null;
      workbench = exampleToDocument(example);
      scheduleCompile(true);
      emit();
    },
    setFocusedPreview(id) {
      if (focusedPreview === id) {
        return;
      }
      focusedPreview = id;
      pendingCommand = "request-inspection";
      emit();
    },
    requestSubmit() {
      pendingCommand = "submit";
      emit();
    },
    requestSyncFromLive() {
      if (liveValues === null) {
        return;
      }
      workbench = {
        ...workbench,
        formDataText: JSON.stringify(liveValues, null, 2),
      };
      activeTab = "formData";
      scheduleCompile(false);
      emit();
    },
    applyInspection(input) {
      if (input.previewId !== focusedPreview) {
        return;
      }
      if (input.documentKey !== documentKey) {
        return;
      }
      liveValues = input.liveValues;
      serialized = input.serialized;
      runtimeDiagnostics = [...input.runtimeDiagnostics].slice(-50);
      emit();
    },
    recordSubmit(previewId, payload) {
      if (previewId !== focusedPreview) {
        return;
      }
      lastSubmit = payload;
      emit();
    },
    recordDiagnostic(previewId, diagnostic) {
      if (previewId !== focusedPreview) {
        return;
      }
      runtimeDiagnostics = [...runtimeDiagnostics, diagnostic].slice(-50);
      emit();
    },
    recordCompileFailure(previewId, nextDocumentKey, diagnostics) {
      if (previewId !== focusedPreview) {
        return;
      }
      if (nextDocumentKey !== documentKey) {
        return;
      }
      liveValues = null;
      serialized = null;
      runtimeDiagnostics = [...diagnostics].slice(-50);
      emit();
    },
    consumePendingCommand() {
      const command = pendingCommand;
      pendingCommand = null;
      return command;
    },
    dispose() {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
      }
      listeners.clear();
    },
  };
}
