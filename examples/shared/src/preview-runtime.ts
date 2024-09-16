import type { Diagnostic, FormInstance, JsonValue } from "@xunserver-jsf/core";
import { formSelector, observeRuntimeDiagnostics, subscribeRuntime } from "@xunserver-jsf/core/runtime";
import { createDemoEnvironment } from "./environment.js";
import {
  isParentToPreviewMessage,
  PLAYGROUND_CHANNEL,
  postToParent,
} from "./protocol.js";
import type { PreviewId, WorkbenchDocument } from "./types.js";
import { compileWorkbenchDocument, readLiveInspection, workbenchDocumentKey } from "./workbench.js";

export interface PreviewRenderContext {
  readonly form: FormInstance;
  readonly onSubmit: (payload: JsonValue) => void;
  readonly onDiagnostic: (diagnostic: Diagnostic) => void;
}

export type PreviewRender = (host: HTMLElement, context: PreviewRenderContext) => () => void;

export function mountPreviewRuntime(options: {
  readonly previewId: PreviewId;
  readonly host: HTMLElement;
  readonly renderPreview: PreviewRender;
}): () => void {
  const environment = createDemoEnvironment();
  let disposePreview: (() => void) | null = null;
  let form: FormInstance | null = null;
  let documentKey = "";
  let runtimeDiagnostics: Diagnostic[] = [];
  let unsubscribeValues: (() => void) | null = null;
  let unsubscribeDiagnostics: (() => void) | null = null;

  function clearSubscriptions(): void {
    unsubscribeValues?.();
    unsubscribeDiagnostics?.();
    unsubscribeValues = null;
    unsubscribeDiagnostics = null;
  }

  function emitInspection(): void {
    if (form === null) {
      postToParent({
        channel: PLAYGROUND_CHANNEL,
        type: "inspection",
        previewId: options.previewId,
        documentKey,
        liveValues: null,
        serialized: null,
        runtimeDiagnostics,
      });
      return;
    }
    const inspection = readLiveInspection(form);
    postToParent({
      channel: PLAYGROUND_CHANNEL,
      type: "inspection",
      previewId: options.previewId,
      documentKey,
      liveValues: inspection.values,
      serialized: inspection.serialized,
      runtimeDiagnostics,
    });
  }

  function showEmpty(message: string): void {
    if (disposePreview !== null) {
      disposePreview();
      disposePreview = null;
    }
    clearSubscriptions();
    form = null;
    options.host.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "preview-empty";
    empty.textContent = message;
    options.host.append(empty);
  }

  function applyDocument(document: WorkbenchDocument | null, nextKey: string): void {
    documentKey = nextKey;
    runtimeDiagnostics = [];
    if (document === null) {
      showEmpty("尚未编译成功。请根据诊断信息修正后再预览。");
      emitInspection();
      return;
    }
    const result = compileWorkbenchDocument(document, environment);
    if (!result.ok) {
      showEmpty("预览编译失败。");
      postToParent({
        channel: PLAYGROUND_CHANNEL,
        type: "compile-failure",
        previewId: options.previewId,
        documentKey: nextKey,
        diagnostics: result.diagnostics,
      });
      return;
    }
    if (disposePreview !== null) {
      disposePreview();
      disposePreview = null;
    }
    clearSubscriptions();
    form = result.form;
    options.host.replaceChildren();
    disposePreview = options.renderPreview(options.host, {
      form: result.form,
      onSubmit: (payload) => {
        postToParent({
          channel: PLAYGROUND_CHANNEL,
          type: "submit",
          previewId: options.previewId,
          payload,
        });
      },
      onDiagnostic: (diagnostic) => {
        runtimeDiagnostics = [...runtimeDiagnostics, diagnostic].slice(-50);
        postToParent({
          channel: PLAYGROUND_CHANNEL,
          type: "diagnostic",
          previewId: options.previewId,
          diagnostic,
        });
      },
    });
    const current = result.form;
    unsubscribeValues = subscribeRuntime(current, formSelector(), () => {
      emitInspection();
    });
    unsubscribeDiagnostics = observeRuntimeDiagnostics(current, (event) => {
      runtimeDiagnostics = [...runtimeDiagnostics, ...event.diagnostics].slice(-50);
      emitInspection();
    });
    emitInspection();
  }

  const onMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) {
      return;
    }
    if (!isParentToPreviewMessage(event.data)) {
      return;
    }
    const message = event.data;
    if (message.type === "document") {
      const key = message.document === null ? message.documentKey : workbenchDocumentKey(message.document);
      applyDocument(message.document, key);
      return;
    }
    if (message.type === "request-inspection") {
      emitInspection();
      return;
    }
    if (message.type === "submit") {
      if (form === null) {
        return;
      }
      void form.submit((payload) => {
        postToParent({
          channel: PLAYGROUND_CHANNEL,
          type: "submit",
          previewId: options.previewId,
          payload,
        });
      });
    }
  };

  window.addEventListener("message", onMessage);
  postToParent({
    channel: PLAYGROUND_CHANNEL,
    type: "ready",
    previewId: options.previewId,
  });
  showEmpty("正在等待编辑器文档…");

  return () => {
    window.removeEventListener("message", onMessage);
    if (disposePreview !== null) {
      disposePreview();
    }
    clearSubscriptions();
    options.host.replaceChildren();
  };
}
