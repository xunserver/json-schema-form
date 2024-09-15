import type { InstancePath, ModelPath } from "./types.js";
import {
  formatInstancePath,
  parseInstancePath,
  type InstancePathSegment,
} from "./instance-path.js";
import { formatModelPath, parseModelPath, type ModelPathSegment } from "./model-path.js";

export function bindTemplatePath(
  template: ModelPath,
  scopeTemplate: ModelPath,
  scopeInstance: InstancePath,
): InstancePath {
  const indexes = listIndexes(scopeTemplate, scopeInstance);
  const templateSegments = parseModelPath(template) ?? [];
  const out: InstancePathSegment[] = [];
  let list = 0;
  for (const segment of templateSegments) {
    if (segment.kind === "property") {
      out.push({ kind: "property", name: segment.name });
    } else if (segment.kind === "tuple") {
      out.push({ kind: "index", index: segment.index });
    } else {
      out.push({ kind: "index", index: indexes[list] ?? 0 });
      list += 1;
    }
  }
  return formatInstancePath(out);
}

export function listIndexes(template: ModelPath, instance: InstancePath): number[] {
  const modelSegments = parseModelPath(template) ?? [];
  const instanceSegments = parseInstancePath(instance) ?? [];
  const indexes: number[] = [];
  let instanceIndex = 0;
  for (const segment of modelSegments) {
    const current = instanceSegments[instanceIndex];
    if (segment.kind === "list" || segment.kind === "tuple") {
      if (current?.kind === "index") {
        indexes.push(current.index);
      }
    }
    instanceIndex += 1;
  }
  return indexes;
}

export function instancePathListCount(path: InstancePath): number {
  return (parseInstancePath(path) ?? []).filter((segment) => segment.kind === "index").length;
}

export function modelPathListCount(path: ModelPath): number {
  return (parseModelPath(path) ?? []).filter((segment) => segment.kind === "list" || segment.kind === "tuple").length;
}

export function formatTemplateFromSegments(segments: readonly ModelPathSegment[]): ModelPath {
  return formatModelPath(segments);
}
