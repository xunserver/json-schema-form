import type { JsonSchema } from "./json-schema.js";
import type { FormConfig } from "./form-config.js";
import type { RuleDefinition } from "./rule-definition.js";
import type { UISchema } from "./ui-schema.js";

export interface FormDefinition {
  readonly schema: JsonSchema;
  readonly uiSchema?: UISchema;
  readonly rules?: readonly RuleDefinition[];
  readonly config?: FormConfig;
}
