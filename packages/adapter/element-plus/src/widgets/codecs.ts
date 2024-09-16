import type { JsonValue } from "@form/core";
import type { CodecResult, ValueCodec } from "@form/vue";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function fail(message: string): CodecResult<never> {
  return { ok: false, code: "adapter.codec-failure", message };
}

export const stringCodec: ValueCodec = {
  encode(canonical) {
    return typeof canonical === "string" ? canonical : "";
  },
  decode(native) {
    return typeof native === "string" ? { ok: true, value: native } : fail("Expected a string");
  },
};

export const numberCodec: ValueCodec = {
  encode(canonical) {
    return typeof canonical === "number" && Number.isFinite(canonical) ? canonical : null;
  },
  decode(native) {
    if (native === null || native === undefined || native === "") {
      return { ok: true, value: null };
    }
    if (typeof native === "number" && Number.isFinite(native)) {
      return { ok: true, value: native };
    }
    return fail("Expected a finite number or null");
  },
};

function isJsonScalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function isNonNullScalar(value: unknown): value is string | number | boolean {
  return value !== null && isJsonScalar(value);
}

export const selectCodec: ValueCodec = {
  encode(canonical) {
    return isJsonScalar(canonical) ? canonical : null;
  },
  decode(native) {
    if (isJsonScalar(native)) {
      return { ok: true, value: native };
    }
    return fail("Expected a JSON scalar or null");
  },
};

export const multiSelectCodec: ValueCodec = {
  encode(canonical) {
    return Array.isArray(canonical)
      ? Object.freeze(canonical.filter(isNonNullScalar))
      : Object.freeze([]);
  },
  decode(native) {
    if (!Array.isArray(native)) {
      return fail("Expected a scalar array");
    }
    const values: (string | number | boolean)[] = [];
    for (const item of native) {
      if (!isNonNullScalar(item)) {
        return fail("Multi-select values must be JSON scalars");
      }
      values.push(item);
    }
    return { ok: true, value: Object.freeze(values) };
  },
};

export const booleanCodec: ValueCodec = {
  encode(canonical) {
    return canonical === true;
  },
  decode(native) {
    return typeof native === "boolean" ? { ok: true, value: native } : fail("Expected a boolean");
  },
};

export const dateCodec: ValueCodec = {
  encode(canonical) {
    return typeof canonical === "string" && ISO_DATE.test(canonical) ? canonical : null;
  },
  decode(native) {
    if (native === null || native === undefined || native === "") {
      return { ok: true, value: null };
    }
    if (native instanceof Date) {
      return fail("Date instances are not canonical date values");
    }
    if (typeof native === "string" && ISO_DATE.test(native)) {
      return { ok: true, value: native };
    }
    return fail("Expected YYYY-MM-DD or null");
  },
};

export const datetimeCodec: ValueCodec = {
  encode(canonical) {
    return typeof canonical === "string" && RFC3339.test(canonical) ? canonical : null;
  },
  decode(native) {
    if (native === null || native === undefined || native === "") {
      return { ok: true, value: null };
    }
    if (native instanceof Date) {
      return fail("Date instances are not canonical datetime values");
    }
    if (typeof native === "string" && RFC3339.test(native)) {
      return { ok: true, value: native };
    }
    return fail("Expected RFC 3339 datetime or null");
  },
};

export function asJsonValue(value: unknown): JsonValue | undefined {
  return value as JsonValue | undefined;
}
