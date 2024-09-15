export class CloneShapeError extends Error {
  readonly reason: "non-plain-object" | "accessor-property" | "cycle";

  constructor(reason: "non-plain-object" | "accessor-property" | "cycle") {
    super(reason);
    this.name = "CloneShapeError";
    this.reason = reason;
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }
  const object = value as object;
  if (seen.has(object)) {
    return value;
  }
  seen.add(object);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item, seen);
    }
  } else {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key], seen);
    }
  }
  return Object.freeze(value);
}

export function clonePlain<T>(value: T, rejectCycles = false): T {
  return cloneUnknown(value, new WeakMap(), new WeakSet(), rejectCycles) as T;
}

function cloneUnknown(
  value: unknown,
  copies: WeakMap<object, unknown>,
  visiting: WeakSet<object>,
  rejectCycles: boolean,
): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }
  if (typeof value === "function") {
    throw new CloneShapeError("non-plain-object");
  }

  const cached = copies.get(value);
  if (cached !== undefined) {
    if (rejectCycles) {
      throw new CloneShapeError("cycle");
    }
    return cached;
  }
  if (visiting.has(value)) {
    throw new CloneShapeError("cycle");
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || hasAccessors(value)) {
      throw new CloneShapeError(
        Object.getPrototypeOf(value) !== Array.prototype ? "non-plain-object" : "accessor-property",
      );
    }
    visiting.add(value);
    const copy: unknown[] = [];
    copies.set(value, copy);
    for (const item of value) {
      copy.push(cloneUnknown(item, copies, visiting, rejectCycles));
    }
    visiting.delete(value);
    return Object.freeze(copy);
  }

  if (!isPlainObject(value) || hasAccessors(value)) {
    throw new CloneShapeError(!isPlainObject(value) ? "non-plain-object" : "accessor-property");
  }

  visiting.add(value);
  const copy: Record<string, unknown> = {};
  copies.set(value, copy);
  for (const key of Object.keys(value)) {
    copy[key] = cloneUnknown(value[key], copies, visiting, rejectCycles);
  }
  visiting.delete(value);
  return Object.freeze(copy);
}

export function isThenable(value: unknown): boolean {
  return (
    (typeof value === "object" &&
      value !== null &&
      "then" in value &&
      typeof (value as { then?: unknown }).then === "function") ||
    (typeof value === "function" &&
      "then" in value &&
      typeof (value as { then?: unknown }).then === "function")
  );
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
