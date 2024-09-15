import type { ModelPath } from "../../model/path/index.js";
import { formatModelPath, parseModelPath, type ModelPathSegment } from "../../model/path/model-path.js";

export function arrayScopeChain(path: ModelPath): readonly ModelPath[] {
  const segments = parseModelPath(path) ?? [];
  const scopes: ModelPath[] = [];
  const prefix: ModelPathSegment[] = [];
  for (const segment of segments) {
    prefix.push(segment);
    if (segment.kind === "list" || segment.kind === "tuple") {
      scopes.push(formatModelPath(prefix));
    }
  }
  return scopes;
}

export function analyzeScopeCompatibility(target: ModelPath, dependency: ModelPath): "compatible" | "ambiguous" {
  const targetChain = arrayScopeChain(target);
  const dependencyChain = arrayScopeChain(dependency);
  if (dependencyChain.length > targetChain.length) {
    return "ambiguous";
  }
  for (let index = 0; index < dependencyChain.length; index += 1) {
    if (dependencyChain[index] !== targetChain[index]) {
      return "ambiguous";
    }
  }
  return "compatible";
}
