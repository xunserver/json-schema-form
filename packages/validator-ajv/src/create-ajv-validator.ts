import { defineValidator, type SchemaAdapterDefinition } from "@xunserver-jsf/core/extension";
import { AjvValidatorAdapter } from "./ajv-validator-adapter.js";

/** Validator registry key，值为 `ajv-2020`。 */
export const AJV_VALIDATOR_KEY = "ajv-2020";

/** 创建 Draft 2020-12 schema-adapter validator，供 `definePlugin` 注册。 */
export function createAjvValidator(options?: { readonly name?: string }): SchemaAdapterDefinition {
  const adapter = new AjvValidatorAdapter();
  const name = options?.name ?? AJV_VALIDATOR_KEY;
  return defineValidator({
    name,
    kind: "schema-adapter",
    validateAll: ({ schema, value }) => adapter.validateAll(schema, value),
  });
}
