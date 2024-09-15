import type { RuntimeNodeId } from "./runtime-node-id.js";

export type SubtreeRemovalReason = "remove" | "clear" | "replace" | "reset" | "whole-array";

export interface SubtreeDescriptor {
  readonly reason: SubtreeRemovalReason;
  readonly roots: readonly RuntimeNodeId[];
  readonly descendants: readonly RuntimeNodeId[];
}

export interface SubtreeCleanupPlan {
  readonly abortEffects: readonly (() => void)[];
  readonly generationInvalidations: readonly string[];
}

export interface RuntimeSubtreeOwner {
  readonly name: string;
  plan(descriptor: SubtreeDescriptor): SubtreeCleanupPlan;
}

export interface InstanceBindingView {
  pathOf(id: RuntimeNodeId): string | undefined;
  idAt(path: string): RuntimeNodeId | undefined;
}

export function freezeBindingView(view: InstanceBindingView): InstanceBindingView {
  return Object.freeze({
    pathOf: (id: RuntimeNodeId) => view.pathOf(id),
    idAt: (path: string) => view.idAt(path),
  });
}
