import type { JsonSchema, JsonSchemaObject, JsonSchemaType } from "../../definition/json-schema.js";

export const JSON_SCHEMA_TYPES: readonly JsonSchemaType[] = [
  "null",
  "boolean",
  "object",
  "array",
  "number",
  "string",
  "integer",
];

export const SCHEMA_KEYWORDS = Object.freeze({
  core: [
    "$id",
    "$schema",
    "$ref",
    "$anchor",
    "$dynamicRef",
    "$dynamicAnchor",
    "$vocabulary",
    "$comment",
    "$defs",
  ],
  applicator: [
    "prefixItems",
    "items",
    "contains",
    "additionalProperties",
    "properties",
    "patternProperties",
    "dependentSchemas",
    "propertyNames",
    "if",
    "then",
    "else",
    "allOf",
    "anyOf",
    "oneOf",
    "not",
    "unevaluatedItems",
    "unevaluatedProperties",
  ],
  validation: [
    "type",
    "enum",
    "const",
    "multipleOf",
    "maximum",
    "exclusiveMaximum",
    "minimum",
    "exclusiveMinimum",
    "maxLength",
    "minLength",
    "pattern",
    "maxItems",
    "minItems",
    "uniqueItems",
    "maxContains",
    "minContains",
    "maxProperties",
    "minProperties",
    "required",
    "dependentRequired",
  ],
  annotation: [
    "title",
    "description",
    "default",
    "deprecated",
    "readOnly",
    "writeOnly",
    "examples",
    "format",
    "contentEncoding",
    "contentMediaType",
    "contentSchema",
  ],
} as const);

export const KNOWN_KEYWORDS: ReadonlySet<string> = new Set([
  ...SCHEMA_KEYWORDS.core,
  ...SCHEMA_KEYWORDS.applicator,
  ...SCHEMA_KEYWORDS.validation,
  ...SCHEMA_KEYWORDS.annotation,
]);

export const STRUCTURAL_OBJECT_KEYWORDS = [
  "properties",
  "required",
  "additionalProperties",
  "patternProperties",
  "dependentSchemas",
  "dependentRequired",
  "propertyNames",
  "maxProperties",
  "minProperties",
  "unevaluatedProperties",
] as const;

export const STRUCTURAL_ARRAY_KEYWORDS = [
  "items",
  "prefixItems",
  "contains",
  "maxItems",
  "minItems",
  "uniqueItems",
  "unevaluatedItems",
  "maxContains",
  "minContains",
] as const;

export function isJsonSchema(value: unknown): value is JsonSchema {
  return typeof value === "boolean" || isJsonSchemaObject(value);
}

export function isJsonSchemaObject(value: unknown): value is JsonSchemaObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isExtensionKeyword(key: string): boolean {
  return key.startsWith("x-");
}

export function objectKeys(value: JsonSchemaObject): readonly string[] {
  return Object.keys(value);
}

export function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
