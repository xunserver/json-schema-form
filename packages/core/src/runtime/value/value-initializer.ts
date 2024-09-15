import type { CompiledFormModel } from "../../model/compiled-form-model.js";
import type { FormEnvironment } from "../../extension/environment.js";
import type { JsonValue } from "../form/contracts.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import { runtimeDiagnostic, sortRuntimeDiagnostics } from "../diagnostics.js";
import { FormRuntimeError } from "../error.js";
import { cloneJsonValue, JsonCloneError } from "./json-value.js";

export function resolveValueInitializerKey(
  model: CompiledFormModel,
  optionKey: string | undefined,
): string | undefined {
  if (optionKey !== undefined) {
    return optionKey;
  }
  return model.rule.serialization.valueInitializer;
}

export function runValueInitializer(
  key: string,
  initialValues: JsonValue | undefined,
  model: CompiledFormModel,
  environment: FormEnvironment,
): JsonValue {
  const provider = environment.valueInitializers.get(key);
  if (provider === undefined) {
    throw fail(RUNTIME_DIAGNOSTIC_CODES.INITIALIZER_UNKNOWN, `Value initializer "${key}" is not registered`, key);
  }

  const frozenValues = initialValues === undefined ? undefined : freezeJson(cloneJsonValue(initialValues));
  const input = Object.freeze({
    initialValues: frozenValues,
    model,
  });

  let output: unknown;
  try {
    output = provider.initialize(input);
  } catch {
    throw fail(RUNTIME_DIAGNOSTIC_CODES.INITIALIZER_FAILED, `Value initializer "${key}" failed`, key);
  }
  if (isThenable(output)) {
    throw fail(RUNTIME_DIAGNOSTIC_CODES.INITIALIZER_FAILED, `Value initializer "${key}" returned a thenable`, key);
  }
  try {
    return cloneJsonValue(output);
  } catch (error) {
    const reason = error instanceof JsonCloneError ? error.reason : "non-json";
    throw fail(
      RUNTIME_DIAGNOSTIC_CODES.INITIALIZER_FAILED,
      `Value initializer "${key}" returned a non-JSON result`,
      key,
      { reason },
    );
  }
}

function fail(
  code: (typeof RUNTIME_DIAGNOSTIC_CODES)["INITIALIZER_UNKNOWN" | "INITIALIZER_FAILED"],
  message: string,
  key: string,
  extra?: Readonly<Record<string, unknown>>,
): FormRuntimeError {
  return new FormRuntimeError(
    sortRuntimeDiagnostics([
      runtimeDiagnostic({
        code,
        message,
        metadata: { valueInitializer: key, ...(extra ?? {}) },
      }),
    ]),
  );
}

function freezeJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      freezeJson(item);
    }
    return Object.freeze(value) as JsonValue;
  }
  const record = value as { readonly [key: string]: JsonValue };
  for (const key of Object.keys(record)) {
    freezeJson(record[key]!);
  }
  return Object.freeze(value);
}

function isThenable(value: unknown): boolean {
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
