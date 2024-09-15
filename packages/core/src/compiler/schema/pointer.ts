import { unescapeJsonPointerToken } from "../../path/schema-path.js";

export function splitJsonPointer(pointer: string): readonly string[] {
  const normalized = pointer.startsWith("#") ? pointer.slice(1) : pointer;
  if (normalized === "" || normalized === "/") {
    return [];
  }
  if (!normalized.startsWith("/")) {
    return [];
  }
  return normalized
    .slice(1)
    .split("/")
    .map((token) => unescapeJsonPointerToken(token));
}

export function isJsonPointerFragment(fragment: string): boolean {
  return fragment === "" || fragment.startsWith("/");
}

export function getAtPointer(document: unknown, pointer: string): unknown {
  let current: unknown = document;
  for (const token of splitJsonPointer(pointer)) {
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(current, token)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}
