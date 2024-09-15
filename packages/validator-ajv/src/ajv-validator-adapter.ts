import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import type { JsonSchema } from "@form/core";
import type { SchemaAdapterIssue } from "@form/core/extension";
import { normalizeAjvErrors } from "./ajv-error-normalizer.js";

export class AjvValidatorAdapter {
  private readonly ajv = new Ajv2020({ allErrors: true, strict: false });
  private readonly cache = new WeakMap<object, ValidateFunction>();

  validateAll(schema: JsonSchema, value: unknown): readonly SchemaAdapterIssue[] {
    const compiled = this.compile(schema);
    compiled(value);
    return normalizeAjvErrors(compiled.errors);
  }

  private compile(schema: JsonSchema): ValidateFunction {
    if (typeof schema !== "object" || schema === null) {
      return this.ajv.compile(schema);
    }
    const cached = this.cache.get(schema);
    if (cached !== undefined) {
      return cached;
    }
    const compiled = this.ajv.compile(schema);
    this.cache.set(schema, compiled);
    return compiled;
  }
}
