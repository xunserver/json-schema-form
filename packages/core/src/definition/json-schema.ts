export type JsonSchemaType =
  | "null"
  | "boolean"
  | "object"
  | "array"
  | "number"
  | "string"
  | "integer";

export type JsonSchema = boolean | JsonSchemaObject;

export interface JsonSchemaObject {
  readonly $id?: string;
  readonly $schema?: string;
  readonly $ref?: string;
  readonly $anchor?: string;
  readonly $dynamicRef?: string;
  readonly $dynamicAnchor?: string;
  readonly $vocabulary?: Readonly<Record<string, boolean>>;
  readonly $comment?: string;
  readonly $defs?: Readonly<Record<string, JsonSchema>>;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly multipleOf?: number;
  readonly maximum?: number;
  readonly exclusiveMaximum?: number;
  readonly minimum?: number;
  readonly exclusiveMinimum?: number;
  readonly maxLength?: number;
  readonly minLength?: number;
  readonly pattern?: string;
  readonly maxItems?: number;
  readonly minItems?: number;
  readonly uniqueItems?: boolean;
  readonly maxContains?: number;
  readonly minContains?: number;
  readonly maxProperties?: number;
  readonly minProperties?: number;
  readonly required?: readonly string[];
  readonly dependentRequired?: Readonly<Record<string, readonly string[]>>;
  readonly format?: string;
  readonly contentEncoding?: string;
  readonly contentMediaType?: string;
  readonly contentSchema?: JsonSchema;
  readonly title?: string;
  readonly description?: string;
  readonly default?: unknown;
  readonly deprecated?: boolean;
  readonly readOnly?: boolean;
  readonly writeOnly?: boolean;
  readonly examples?: readonly unknown[];
  readonly prefixItems?: readonly JsonSchema[];
  readonly items?: JsonSchema;
  readonly contains?: JsonSchema;
  readonly additionalProperties?: JsonSchema;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly patternProperties?: Readonly<Record<string, JsonSchema>>;
  readonly dependentSchemas?: Readonly<Record<string, JsonSchema>>;
  readonly propertyNames?: JsonSchema;
  readonly unevaluatedItems?: JsonSchema;
  readonly unevaluatedProperties?: JsonSchema;
  readonly allOf?: readonly JsonSchema[];
  readonly anyOf?: readonly JsonSchema[];
  readonly oneOf?: readonly JsonSchema[];
  readonly not?: JsonSchema;
  readonly if?: JsonSchema;
  readonly then?: JsonSchema;
  readonly else?: JsonSchema;
}
