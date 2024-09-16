import { defineValidator, type SchemaAdapterDefinition } from "@xunserver-jsf/core/extension";
import { AjvValidatorAdapter } from "./ajv-validator-adapter.js";

export const AJV_VALIDATOR_KEY = "ajv-2020";

export function createAjvValidator(options?: { readonly name?: string }): SchemaAdapterDefinition {
  const adapter = new AjvValidatorAdapter();
  const name = options?.name ?? AJV_VALIDATOR_KEY;
  return defineValidator({
    name,
    kind: "schema-adapter",
    validateAll: ({ schema, value }) => adapter.validateAll(schema, value),
  });
}
