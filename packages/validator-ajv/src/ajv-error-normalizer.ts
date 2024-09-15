import type { ErrorObject } from "ajv";
import type { SchemaAdapterIssue } from "@form/core/extension";
import type { JsonValue } from "@form/core";

export function normalizeAjvErrors(
  errors: readonly ErrorObject[] | null | undefined,
): readonly SchemaAdapterIssue[] {
  if (errors === null || errors === undefined) {
    return Object.freeze([]);
  }
  return Object.freeze(
    errors.map((error) => {
      const params = cloneParams(error.params);
      const issue: SchemaAdapterIssue = {
        code: error.keyword,
        instancePath: error.instancePath,
        keyword: error.keyword,
        ...(error.message === undefined ? {} : { message: error.message }),
        ...(params === undefined ? {} : { params }),
        ...(error.schemaPath === undefined ? {} : { schemaPath: error.schemaPath }),
      };
      return Object.freeze(issue);
    }),
  );
}

function cloneParams(params: Record<string, unknown> | undefined): JsonValue | undefined {
  if (params === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(params)) as JsonValue;
}
