import type { Diagnostic, JsonValue } from "@form/core";
import type { PreviewId, WorkbenchDocument } from "./types.js";

export const PLAYGROUND_CHANNEL = "form-playground-v1";

export type ParentToPreviewMessage =
  | {
      readonly channel: typeof PLAYGROUND_CHANNEL;
      readonly type: "document";
      readonly exampleId: string;
      readonly document: WorkbenchDocument | null;
      readonly documentKey: string;
    }
  | {
      readonly channel: typeof PLAYGROUND_CHANNEL;
      readonly type: "submit";
    }
  | {
      readonly channel: typeof PLAYGROUND_CHANNEL;
      readonly type: "request-inspection";
    };

export type PreviewToParentMessage =
  | {
      readonly channel: typeof PLAYGROUND_CHANNEL;
      readonly type: "ready";
      readonly previewId: PreviewId;
    }
  | {
      readonly channel: typeof PLAYGROUND_CHANNEL;
      readonly type: "inspection";
      readonly previewId: PreviewId;
      readonly documentKey: string;
      readonly liveValues: JsonValue | null;
      readonly serialized: JsonValue | null;
      readonly runtimeDiagnostics: readonly Diagnostic[];
    }
  | {
      readonly channel: typeof PLAYGROUND_CHANNEL;
      readonly type: "submit";
      readonly previewId: PreviewId;
      readonly payload: JsonValue;
    }
  | {
      readonly channel: typeof PLAYGROUND_CHANNEL;
      readonly type: "diagnostic";
      readonly previewId: PreviewId;
      readonly diagnostic: Diagnostic;
    }
  | {
      readonly channel: typeof PLAYGROUND_CHANNEL;
      readonly type: "compile-failure";
      readonly previewId: PreviewId;
      readonly documentKey: string;
      readonly diagnostics: readonly Diagnostic[];
    };

export function isParentToPreviewMessage(value: unknown): value is ParentToPreviewMessage {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as { channel?: unknown; type?: unknown };
  if (record.channel !== PLAYGROUND_CHANNEL || typeof record.type !== "string") {
    return false;
  }
  return record.type === "document" || record.type === "submit" || record.type === "request-inspection";
}

export function isPreviewToParentMessage(value: unknown): value is PreviewToParentMessage {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as { channel?: unknown; type?: unknown };
  if (record.channel !== PLAYGROUND_CHANNEL || typeof record.type !== "string") {
    return false;
  }
  return (
    record.type === "ready" ||
    record.type === "inspection" ||
    record.type === "submit" ||
    record.type === "diagnostic" ||
    record.type === "compile-failure"
  );
}

export function postToPreview(target: Window, message: ParentToPreviewMessage): void {
  target.postMessage(message, window.location.origin);
}

export function postToParent(message: PreviewToParentMessage): void {
  if (window.parent === window) {
    return;
  }
  window.parent.postMessage(message, window.location.origin);
}
