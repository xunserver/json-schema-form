import type { JsonValue } from "@form/core";
import type { CodecResult, ValueCodec } from "@form/react";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const FINITE_NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

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
    return typeof canonical === "number" && Number.isFinite(canonical) ? String(canonical) : "";
  },
  decode(native) {
    if (native === null || native === undefined || native === "") {
      return { ok: true, value: null };
    }
    if (typeof native === "number") {
      return Number.isFinite(native) ? { ok: true, value: native } : fail("Expected a finite number or null");
    }
    if (typeof native === "string") {
      const trimmed = native.trim();
      if (trimmed === "") {
        return { ok: true, value: null };
      }
      if (!FINITE_NUMBER.test(trimmed)) {
        return fail("Expected a finite number or null");
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? { ok: true, value: parsed } : fail("Expected a finite number or null");
    }
    return fail("Expected a finite number or null");
  },
};

function isJsonScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isNonNullScalar(value: unknown): value is string | number | boolean {
  return value !== null && isJsonScalar(value);
}

export function optionToken(value: string | number | boolean, index: number): string {
  return `opt:${index}:${typeof value}`;
}

export function parseOptionToken(
  token: unknown,
  options: readonly { readonly value: string | number | boolean }[],
): CodecResult<string | number | boolean> {
  if (typeof token !== "string" || !token.startsWith("opt:")) {
    return fail("Expected a typed option token");
  }
  const parts = token.split(":");
  const index = Number(parts[1]);
  const option = options[index];
  if (option === undefined || `opt:${index}:${typeof option.value}` !== token) {
    return fail("Option token does not match a declared option");
  }
  return { ok: true, value: option.value };
}

export const selectCodec: ValueCodec = {
  encode(canonical) {
    return isJsonScalar(canonical) ? canonical : null;
  },
  decode(native) {
    if (native !== null && typeof native === "object") {
      return fail("MUI option objects are not canonical select values");
    }
    if (isJsonScalar(native)) {
      return { ok: true, value: native };
    }
    return fail("Expected a JSON scalar or null");
  },
};

export function createSelectCodec(
  options: readonly { readonly value: string | number | boolean }[],
): ValueCodec {
  return {
    encode(canonical) {
      if (canonical === null || canonical === undefined) {
        return "";
      }
      const index = options.findIndex((option) => Object.is(option.value, canonical));
      return index >= 0 ? optionToken(options[index]!.value, index) : "";
    },
    decode(native) {
      if (native === "" || native === null || native === undefined) {
        return { ok: true, value: null };
      }
      if (native !== null && typeof native === "object") {
        return fail("MUI option objects are not canonical select values");
      }
      return parseOptionToken(native, options);
    },
  };
}

export function createMultiSelectCodec(
  options: readonly { readonly value: string | number | boolean }[],
): ValueCodec {
  const single = createSelectCodec(options);
  return {
    encode(canonical) {
      if (!Array.isArray(canonical)) {
        return Object.freeze([]);
      }
      return Object.freeze(
        canonical
          .map((item) => single.encode(item))
          .filter((item): item is string => typeof item === "string" && item !== ""),
      );
    },
    decode(native) {
      if (!Array.isArray(native)) {
        return fail("Expected a scalar array");
      }
      const values: (string | number | boolean)[] = [];
      for (const item of native) {
        const decoded = single.decode(item);
        if (!decoded.ok || decoded.value === null || decoded.value === undefined) {
          return fail("Multi-select values must be JSON scalars");
        }
        if (!isNonNullScalar(decoded.value)) {
          return fail("Multi-select values must be JSON scalars");
        }
        values.push(decoded.value);
      }
      return { ok: true, value: Object.freeze(values) };
    },
  };
}

export const multiSelectCodec: ValueCodec = {
  encode(canonical) {
    return Array.isArray(canonical) ? Object.freeze(canonical.filter(isNonNullScalar)) : Object.freeze([]);
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
    return typeof canonical === "string" && ISO_DATE.test(canonical) ? canonical : "";
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
    return typeof canonical === "string" && RFC3339.test(canonical) ? canonical : "";
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
