import type { JsonSchema } from "../../definition/json-schema.js";
import type { JsonValue } from "../../definition/json-value.js";
import type { FormEnvironment } from "../../extension/environment.js";
import type {
  DialectConvertResult,
  DialectDiagnostic,
  SchemaDialectDefinition,
} from "../../extension/contributions.js";
import { SCHEMA_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import { ROOT_SCHEMA_PATH, childSchemaPath } from "../../model/path/index.js";
import { DiagnosticBag, schemaError, schemaInfo } from "../diagnostics.js";
import { CloneShapeError, clonePlain, deepFreeze, isPlainObject, isThenable } from "../immutable.js";
import { isDraft202012Dialect } from "../../schema/dialect.js";
import { isJsonSchema } from "../../schema/keywords.js";

export interface DialectAdapterBinding {
  readonly key: string;
  readonly pluginId: string;
  readonly adapter: SchemaDialectDefinition;
}

export interface DialectConversion {
  readonly schema: JsonSchema;
  readonly adapter?: DialectAdapterBinding;
  readonly originalDialect?: string;
}

export function buildDialectAdapterIndex(
  environment: FormEnvironment,
): ReadonlyMap<string, DialectAdapterBinding> {
  const index = new Map<string, DialectAdapterBinding>();
  for (const entry of environment.schemaDialects.inspectAll()) {
    for (const uri of entry.value.dialects) {
      index.set(uri, { key: entry.key, pluginId: entry.pluginId, adapter: entry.value });
    }
  }
  return index;
}

export function convertRootDialect(
  schema: JsonSchema,
  environment: FormEnvironment,
  diagnostics: DiagnosticBag,
): DialectConversion | undefined {
  if (typeof schema === "boolean") {
    return { schema };
  }
  const declared = schema.$schema;
  if (declared === undefined) {
    return { schema };
  }
  if (typeof declared === "string" && isDraft202012Dialect(declared)) {
    return { schema };
  }

  const index = buildDialectAdapterIndex(environment);
  const binding = typeof declared === "string" ? index.get(declared) : undefined;
  if (binding === undefined) {
    diagnostics.push(
      schemaError(
        SCHEMA_DIAGNOSTIC_CODES.INVALID_DIALECT,
        `Unsupported JSON Schema dialect: ${String(declared)}`,
        childSchemaPath(ROOT_SCHEMA_PATH, "$schema"),
        { dialect: declared },
      ),
    );
    return undefined;
  }

  const converted = invokeConvert(schema, binding, diagnostics);
  if (converted === undefined) {
    return undefined;
  }
  diagnostics.push(
    schemaInfo(
      SCHEMA_DIAGNOSTIC_CODES.DIALECT_CONVERTED,
      `Converted dialect ${String(declared)} with adapter "${binding.adapter.name}"`,
      ROOT_SCHEMA_PATH,
      {
        dialect: declared,
        adapter: binding.adapter.name,
        pluginId: binding.pluginId,
      },
      binding.pluginId,
    ),
  );
  return {
    schema: converted,
    adapter: binding,
    originalDialect: typeof declared === "string" ? declared : String(declared),
  };
}

function invokeConvert(
  schema: JsonSchema,
  binding: DialectAdapterBinding,
  diagnostics: DiagnosticBag,
): JsonSchema | undefined {
  const frozenInput = deepFreeze(clonePlain(schema as JsonValue));
  let raw: unknown;
  try {
    raw = binding.adapter.convert(frozenInput);
  } catch {
    pushAdapterFailure(diagnostics, binding, "threw");
    return undefined;
  }
  if (isThenable(raw)) {
    pushAdapterFailure(diagnostics, binding, "thenable");
    return undefined;
  }
  if (!isPlainObject(raw) || !("schema" in raw)) {
    pushAdapterFailure(diagnostics, binding, "invalid-result");
    return undefined;
  }
  const result = raw as unknown as DialectConvertResult;
  mergeAdapterDiagnostics(result.diagnostics, binding, diagnostics);
  if (diagnostics.hasErrors()) {
    return undefined;
  }

  let cloned: unknown;
  try {
    cloned = clonePlain(result.schema);
  } catch (error) {
    const reason = error instanceof CloneShapeError ? error.reason : "non-json";
    pushAdapterFailure(diagnostics, binding, "non-json", reason);
    return undefined;
  }
  if (isThenable(cloned) || !isJsonSchema(cloned)) {
    pushAdapterFailure(diagnostics, binding, "non-json", "not-schema");
    return undefined;
  }
  if (typeof cloned === "object") {
    const declared = cloned.$schema;
    if (declared !== undefined && (typeof declared !== "string" || !isDraft202012Dialect(declared))) {
      pushAdapterFailure(diagnostics, binding, "non-canonical", String(declared));
      return undefined;
    }
  }
  return deepFreeze(cloned);
}

function mergeAdapterDiagnostics(
  items: readonly DialectDiagnostic[] | undefined,
  binding: DialectAdapterBinding,
  diagnostics: DiagnosticBag,
): void {
  if (items === undefined) {
    return;
  }
  for (const item of items) {
    const schemaPath = item.schemaPath ?? ROOT_SCHEMA_PATH;
    const metadata = {
      adapter: binding.adapter.name,
      pluginId: binding.pluginId,
      ...(item.metadata ?? {}),
    };
    if (item.severity === "error") {
      diagnostics.push(
        schemaError(
          SCHEMA_DIAGNOSTIC_CODES.DIALECT_ADAPTER_FAILED,
          item.message,
          schemaPath,
          { ...metadata, ...(item.code === undefined ? {} : { adapterCode: item.code }) },
          binding.pluginId,
        ),
      );
      continue;
    }
    if (item.severity === "info") {
      diagnostics.push(
        schemaInfo(
          SCHEMA_DIAGNOSTIC_CODES.DIALECT_CONVERTED,
          item.message,
          schemaPath,
          { ...metadata, ...(item.code === undefined ? {} : { adapterCode: item.code }) },
          binding.pluginId,
        ),
      );
      continue;
    }
    diagnostics.push({
      code: item.code ?? SCHEMA_DIAGNOSTIC_CODES.DIALECT_CONVERTED,
      severity: "warning",
      message: item.message,
      source: "schema",
      schemaPath,
      pluginId: binding.pluginId,
      metadata,
    });
  }
}

function pushAdapterFailure(
  diagnostics: DiagnosticBag,
  binding: DialectAdapterBinding,
  reason: string,
  detail?: string,
): void {
  diagnostics.push(
    schemaError(
      SCHEMA_DIAGNOSTIC_CODES.DIALECT_ADAPTER_FAILED,
      `Schema dialect adapter "${binding.adapter.name}" failed`,
      ROOT_SCHEMA_PATH,
      {
        adapter: binding.adapter.name,
        pluginId: binding.pluginId,
        reason,
        ...(detail === undefined ? {} : { detail }),
      },
      binding.pluginId,
    ),
  );
}
