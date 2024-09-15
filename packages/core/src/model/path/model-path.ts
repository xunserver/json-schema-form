import type { ModelPath, ModelPathLike } from "./types.js";

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const INSTANCE_INDEX = /^\[(?:0|[1-9]\d*)\]/;

export type ModelPathSegment =
  | { readonly kind: "property"; readonly name: string }
  | { readonly kind: "list" }
  | { readonly kind: "tuple"; readonly index: number };

export const ROOT_MODEL_PATH = "" as ModelPath;

export function isIdentPropertyName(name: string): boolean {
  return IDENT.test(name);
}

export function asModelPath(value: string): ModelPath {
  return value as ModelPath;
}

export function formatModelPath(segments: readonly ModelPathSegment[]): ModelPath {
  let out = "";
  for (const segment of segments) {
    out += formatSegment(out.length === 0, segment);
  }
  return asModelPath(out);
}

export function parseModelPath(input: ModelPathLike): readonly ModelPathSegment[] | undefined {
  if (input === "") {
    return [];
  }

  const segments: ModelPathSegment[] = [];
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
      if (INSTANCE_INDEX.test(input.slice(index))) {
        return undefined;
      }
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

export function isValidModelPath(input: ModelPathLike): boolean {
  return parseModelPath(input) !== undefined;
}

export function toModelPath(input: ModelPathLike): ModelPath | undefined {
  const segments = parseModelPath(input);
  if (segments === undefined) {
    return undefined;
  }
  return formatModelPath(segments);
}

export function joinModelPath(parent: ModelPath, segment: ModelPathSegment): ModelPath {
  const parsed = parseModelPath(parent);
  if (parsed === undefined) {
    throw new Error(`Invalid parent ModelPath: ${parent}`);
  }
  return formatModelPath([...parsed, segment]);
}

export function modelPathStartsWith(path: ModelPath, scope: ModelPath): boolean {
  if (scope === ROOT_MODEL_PATH) {
    return true;
  }
  if (path === scope) {
    return true;
  }
  return path.startsWith(scope) && isBoundary(path[scope.length]);
}

function isBoundary(character: string | undefined): boolean {
  return character === "." || character === "[";
}

function formatSegment(atRoot: boolean, segment: ModelPathSegment): string {
  if (segment.kind === "list") {
    return "[]";
  }
  if (segment.kind === "tuple") {
    return `[#${segment.index}]`;
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
): { readonly segment: ModelPathSegment; readonly end: number } | undefined {
  if (input.startsWith("[]", start)) {
    return { segment: { kind: "list" }, end: start + 2 };
  }

  if (input.startsWith("[#", start)) {
    return readTuple(input, start);
  }

  if (input[start + 1] === '"') {
    const json = parseJsonString(input, start + 1);
    if (json === undefined || input[json.end] !== "]") {
      return undefined;
    }
    return { segment: { kind: "property", name: json.value }, end: json.end + 1 };
  }

  return undefined;
}

function readTuple(
  input: string,
  start: number,
): { readonly segment: ModelPathSegment; readonly end: number } | undefined {
  let cursor = start + 2;
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
    segment: { kind: "tuple", index: Number(input.slice(digitStart, cursor)) },
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
