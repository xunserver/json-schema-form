export type CloneFailureReason = "non-plain-object" | "accessor-property";

export interface CloneSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface CloneFailure {
  readonly ok: false;
  readonly reason: CloneFailureReason;
}

class DescriptorShapeError extends Error {
  readonly reason: CloneFailureReason;

  constructor(reason: CloneFailureReason) {
    super(reason);
    this.name = "DescriptorShapeError";
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

export function cloneAndFreezeOwned<T>(value: T): CloneSuccess<T> | CloneFailure {
  const seen = new WeakMap<object, unknown>();

  try {
    return { ok: true, value: cloneUnknown(value, seen) as T };
  } catch (error) {
    if (error instanceof DescriptorShapeError) {
      return { ok: false, reason: error.reason };
    }

    throw error;
  }
}

function cloneUnknown(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }

  if (typeof value === "function") {
    return value;
  }

  const cached = seen.get(value);
  if (cached !== undefined) {
    return cached;
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || hasAccessors(value)) {
      throw new DescriptorShapeError(
        Object.getPrototypeOf(value) !== Array.prototype ? "non-plain-object" : "accessor-property",
      );
    }

    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const item of value) {
      copy.push(cloneUnknown(item, seen));
    }
    return Object.freeze(copy);
  }

  if (!isPlainObject(value)) {
    throw new DescriptorShapeError("non-plain-object");
  }

  if (hasAccessors(value)) {
    throw new DescriptorShapeError("accessor-property");
  }

  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const key of Object.keys(value)) {
    copy[key] = cloneUnknown(value[key], seen);
  }
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
