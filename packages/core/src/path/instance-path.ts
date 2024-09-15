import { isIdentPropertyName } from "./model-path.js";
import type { InstancePath, InstancePathLike } from "./types.js";

export type InstancePathSegment =
  | { readonly kind: "property"; readonly name: string }
  | { readonly kind: "index"; readonly index: number };

export const ROOT_INSTANCE_PATH = "" as InstancePath;

export function asInstancePath(value: string): InstancePath {
  return value as InstancePath;
}

export function formatInstancePath(segments: readonly InstancePathSegment[]): InstancePath {
  let out = "";
  for (const segment of segments) {
    out += formatSegment(out.length === 0, segment);
  }
  return asInstancePath(out);
}

export function parseInstancePath(input: InstancePathLike): readonly InstancePathSegment[] | undefined {
  if (input === "") {
    return [];
  }

  const segments: InstancePathSegment[] = [];
  let index = 0;

  while (index < input.length) {
    const current = input[index];
    if (current === ".") {
      if (index === 0 || index + 1 >= input.length) {
        return undefined;
      }
      index += 1;
      const ident = readIdent(input, index);
      if (ident === undefined) {
        return undefined;
      }
      segments.push({ kind: "property", name: ident.value });
      index = ident.end;
      continue;
    }

    if (current === "[") {
      const bracket = readBracket(input, index);
      if (bracket === undefined) {
        return undefined;
      }
      segments.push(bracket.segment);
      index = bracket.end;
      continue;
    }

    if (segments.length > 0) {
      return undefined;
    }

    const ident = readIdent(input, index);
    if (ident === undefined) {
      return undefined;
    }
    segments.push({ kind: "property", name: ident.value });
    index = ident.end;
  }

  return segments;
}

export function isValidInstancePath(input: InstancePathLike): boolean {
  return parseInstancePath(input) !== undefined;
}

export function toInstancePath(input: InstancePathLike): InstancePath | undefined {
  const segments = parseInstancePath(input);
  if (segments === undefined) {
    return undefined;
  }
  return formatInstancePath(segments);
}

export function joinInstancePath(parent: InstancePath, segment: InstancePathSegment): InstancePath {
  const parsed = parseInstancePath(parent);
  if (parsed === undefined) {
    throw new Error(`Invalid parent InstancePath: ${parent}`);
  }
  return formatInstancePath([...parsed, segment]);
}

export function instancePathStartsWith(path: InstancePath, scope: InstancePath): boolean {
  if (scope === ROOT_INSTANCE_PATH) {
    return true;
  }
  if (path === scope) {
    return true;
  }
  return path.startsWith(scope) && isBoundary(path[scope.length]);
}

export function instancePathAncestors(path: InstancePath): readonly InstancePath[] {
  const segments = parseInstancePath(path);
  if (segments === undefined || segments.length === 0) {
    return [];
  }
  const ancestors: InstancePath[] = [ROOT_INSTANCE_PATH];
  for (let index = 1; index < segments.length; index += 1) {
    ancestors.push(formatInstancePath(segments.slice(0, index)));
  }
  return ancestors;
}

function isBoundary(character: string | undefined): boolean {
  return character === "." || character === "[";
}

function formatSegment(atRoot: boolean, segment: InstancePathSegment): string {
  if (segment.kind === "index") {
    return `[${segment.index}]`;
  }
  if (isIdentPropertyName(segment.name)) {
    return atRoot ? segment.name : `.${segment.name}`;
  }
  return `[${JSON.stringify(segment.name)}]`;
}

function readIdent(
  input: string,
  start: number,
): { readonly value: string; readonly end: number } | undefined {
  if (start >= input.length) {
    return undefined;
  }
  const first = input[start]!;
  if (!/[A-Za-z_]/.test(first)) {
    return undefined;
  }
  let end = start + 1;
  while (end < input.length && /[A-Za-z0-9_]/.test(input[end]!)) {
    end += 1;
  }
  return { value: input.slice(start, end), end };
}

function readBracket(
  input: string,
  start: number,
): { readonly segment: InstancePathSegment; readonly end: number } | undefined {
  if (input.startsWith("[]", start) || input.startsWith("[#", start)) {
    return undefined;
  }

  const after = input[start + 1];
  if (after === '"') {
    const json = parseJsonString(input, start + 1);
    if (json === undefined || input[json.end] !== "]") {
      return undefined;
    }
    return { segment: { kind: "property", name: json.value }, end: json.end + 1 };
  }

  return readIndex(input, start);
}

function readIndex(
  input: string,
  start: number,
): { readonly segment: InstancePathSegment; readonly end: number } | undefined {
  let cursor = start + 1;
  if (cursor >= input.length || !/[0-9]/.test(input[cursor]!)) {
    return undefined;
  }
  if (input[cursor] === "0" && cursor + 1 < input.length && /[0-9]/.test(input[cursor + 1]!)) {
    return undefined;
  }
  const digitStart = cursor;
  cursor += 1;
  while (cursor < input.length && /[0-9]/.test(input[cursor]!)) {
    cursor += 1;
  }
  if (input[cursor] !== "]") {
    return undefined;
  }
  return {
    segment: { kind: "index", index: Number(input.slice(digitStart, cursor)) },
    end: cursor + 1,
  };
}

function parseJsonString(
  input: string,
  start: number,
): { readonly value: string; readonly end: number } | undefined {
  if (input[start] !== '"') {
    return undefined;
  }

  let escaped = false;
  for (let index = start + 1; index < input.length; index += 1) {
    const character = input[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      try {
        const value: unknown = JSON.parse(input.slice(start, index + 1));
        if (typeof value !== "string") {
          return undefined;
        }
        return { value, end: index + 1 };
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}
