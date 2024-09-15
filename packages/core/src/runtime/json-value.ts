import type { JsonValue } from "./contracts.js";

export type JsonCloneFailureReason =
  | "accessor-property"
  | "function"
  | "symbol"
  | "cycle"
  | "non-json";

export class JsonCloneError extends Error {
  readonly reason: JsonCloneFailureReason;

  constructor(reason: JsonCloneFailureReason) {
    super(reason);
    this.name = "JsonCloneError";
    this.reason = reason;
  }
}

export function isPlainJsonObject(value: unknown): value is Record<string, JsonValue> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function cloneJsonValue(value: unknown): JsonValue {
  return cloneUnknown(value, new WeakMap(), new WeakSet()) as JsonValue;
}

export function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  if (typeof left === "number" && typeof right === "number" && left === 0 && right === 0) {
    return true;
  }
  if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
    return Object.is(left, right);
  }
  if (Array.isArray(left)) {
    if (!Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    for (let index = 0; index < left.length; index += 1) {
      if (!jsonEqual(left[index], right[index])) {
        return false;
      }
    }
    return true;
  }
  if (Array.isArray(right) || !isPlainJsonObject(left) || !isPlainJsonObject(right)) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) {
      return false;
    }
    if (!jsonEqual(left[key], right[key])) {
      return false;
    }
  }
  return true;
}

export type JsonPathSegment =
  | { readonly kind: "property"; readonly name: string }
  | { readonly kind: "index"; readonly index: number };

export function getJsonAt(
  root: JsonValue | undefined,
  segments: readonly JsonPathSegment[],
): JsonValue | undefined {
  let current: unknown = root;
  for (const segment of segments) {
    if (current === undefined || current === null) {
      return undefined;
    }
    if (segment.kind === "index") {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment.index];
      continue;
    }
    if (typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment.name];
  }
  return current as JsonValue | undefined;
}

export type JsonUpdateFailure = "not-container" | "index-write";

export function setJsonPath(
  root: JsonValue | undefined,
  segments: readonly JsonPathSegment[],
  nextValue: JsonValue,
  materializeObject: (prefix: readonly JsonPathSegment[]) => boolean,
): { readonly ok: true; readonly value: JsonValue; readonly changed: boolean } | { readonly ok: false; readonly reason: JsonUpdateFailure } {
  if (segments.length === 0) {
    if (jsonEqual(root, nextValue)) {
      return { ok: true, value: (root as JsonValue | undefined) ?? nextValue, changed: false };
    }
    return { ok: true, value: nextValue, changed: true };
  }

  const result = setAt(root, segments, 0, nextValue, materializeObject, []);
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: result.value, changed: result.changed };
}

export function diffJsonValuePaths(
  before: JsonValue | undefined,
  after: JsonValue | undefined,
  formatPath: (segments: readonly JsonPathSegment[]) => string,
  prefix: readonly JsonPathSegment[] = [],
): string[] {
  if (jsonEqual(before, after)) {
    return [];
  }

  const paths = [formatPath(prefix)];
  if (isPlainJsonObject(before) && isPlainJsonObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      paths.push(
        ...diffJsonValuePaths(before[key], after[key], formatPath, [
          ...prefix,
          { kind: "property", name: key },
        ]),
      );
    }
  }
  return paths;
}

export function reuseEqualBranches(before: JsonValue | undefined, after: JsonValue): JsonValue {
  if (before !== undefined && jsonEqual(before, after)) {
    return before;
  }
  if (isPlainJsonObject(before) && isPlainJsonObject(after)) {
    const copy: Record<string, JsonValue> = {};
    for (const key of Object.keys(after)) {
      const previous = before[key];
      const next = after[key];
      if (next === undefined) {
        continue;
      }
      copy[key] = reuseEqualBranches(previous, next);
    }
    return Object.freeze(copy);
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    const copy = after.map((item, index) => reuseEqualBranches(before[index], item));
    return Object.freeze(copy);
  }
  return after;
}

function setAt(
  current: JsonValue | undefined,
  segments: readonly JsonPathSegment[],
  index: number,
  nextValue: JsonValue,
  materializeObject: (prefix: readonly JsonPathSegment[]) => boolean,
  prefix: readonly JsonPathSegment[],
): { readonly ok: true; readonly value: JsonValue; readonly changed: boolean } | { readonly ok: false; readonly reason: JsonUpdateFailure } {
  const segment = segments[index];
  if (segment === undefined) {
    if (jsonEqual(current, nextValue)) {
      return { ok: true, value: current as JsonValue, changed: false };
    }
    return { ok: true, value: nextValue, changed: true };
  }

  if (segment.kind === "index") {
    return { ok: false, reason: "index-write" };
  }

  let container: Record<string, JsonValue>;
  if (current === undefined) {
    if (!materializeObject(prefix)) {
      return { ok: false, reason: "not-container" };
    }
    container = {};
  } else if (isPlainJsonObject(current)) {
    container = current as Record<string, JsonValue>;
  } else {
    return { ok: false, reason: "not-container" };
  }

  const childPrefix = [...prefix, segment];
  const existing = container[segment.name];
  const child = setAt(existing, segments, index + 1, nextValue, materializeObject, childPrefix);
  if (!child.ok) {
    return child;
  }
  if (!child.changed && isPlainJsonObject(current) && Object.is(existing, child.value)) {
    return { ok: true, value: current, changed: false };
  }

  const copy: Record<string, JsonValue> = {};
  for (const key of Object.keys(container)) {
    copy[key] = container[key]!;
  }
  copy[segment.name] = child.value;
  return { ok: true, value: Object.freeze(copy), changed: true };
}

function cloneUnknown(
  value: unknown,
  copies: WeakMap<object, unknown>,
  visiting: WeakSet<object>,
): unknown {
  if (value === null) {
    return null;
  }
  const valueType = typeof value;
  if (valueType === "string" || valueType === "boolean") {
    return value;
  }
  if (valueType === "number") {
    if (!Number.isFinite(value)) {
      throw new JsonCloneError("non-json");
    }
    return value;
  }
  if (valueType === "function") {
    throw new JsonCloneError("function");
  }
  if (valueType === "symbol" || valueType === "bigint" || valueType === "undefined") {
    throw new JsonCloneError(valueType === "symbol" ? "symbol" : "non-json");
  }
  if (valueType !== "object") {
    throw new JsonCloneError("non-json");
  }

  const object = value as object;
  if (visiting.has(object)) {
    throw new JsonCloneError("cycle");
  }
  const cached = copies.get(object);
  if (cached !== undefined) {
    return cached;
  }

  if (Object.getOwnPropertySymbols(object).length > 0) {
    throw new JsonCloneError("symbol");
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || hasAccessors(value)) {
      throw new JsonCloneError(
        Object.getPrototypeOf(value) !== Array.prototype ? "non-json" : "accessor-property",
      );
    }
    visiting.add(value);
    const copy: unknown[] = [];
    copies.set(value, copy);
    for (const item of value) {
      copy.push(cloneUnknown(item, copies, visiting));
    }
    visiting.delete(value);
    return Object.freeze(copy);
  }

  if (!isPlainJsonObject(value) || hasAccessors(value)) {
    throw new JsonCloneError(!isPlainJsonObject(value) ? "non-json" : "accessor-property");
  }

  visiting.add(value);
  const copy: Record<string, unknown> = {};
  copies.set(value, copy);
  for (const key of Object.keys(value)) {
    copy[key] = cloneUnknown(value[key], copies, visiting);
  }
  visiting.delete(value);
  return Object.freeze(copy);
}

function hasAccessors(value: object): boolean {
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) {
      return true;
    }
  }
  return false;
}
