import type { JsonSchema, JsonSchemaObject, JsonSchemaType } from "../../definition/json-schema.js";
import type { JsonValue } from "../../definition/json-value.js";
import type { FormEnvironment } from "../../extension/environment.js";
import { SCHEMA_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import {
  ROOT_SCHEMA_PATH,
  asSchemaPath,
  childSchemaPath,
  type SchemaPath,
} from "../../model/path/index.js";
import { DiagnosticBag, schemaError, schemaWarning } from "../diagnostics.js";
import { clonePlain, deepFreeze } from "../immutable.js";
import { convertRootDialect } from "./dialect-adapter.js";
import { buildSchemaExtensionIndex, type DeclaredExtensionOccurrence } from "./extensions.js";
import { isDraft202012Dialect } from "../../schema/dialect.js";
import {
  JSON_SCHEMA_TYPES,
  KNOWN_KEYWORDS,
  STRUCTURAL_ARRAY_KEYWORDS,
  STRUCTURAL_OBJECT_KEYWORDS,
  hasOwn,
  isExtensionKeyword,
  isJsonSchema,
  isJsonSchemaObject,
} from "../../schema/keywords.js";
import { getAtPointer, isJsonPointerFragment } from "./pointer.js";
import {
  DEFAULT_SCHEMA_BASE_URI,
  canonicalNodeId,
  isAbsoluteUri,
  resolveUri,
  splitUri,
} from "./uri.js";

import type { CanonicalSchemaGraph, CanonicalSchemaNode, SchemaRefEdge } from "./graph.js";
export type { CanonicalSchemaGraph, CanonicalSchemaNode, SchemaRefEdge };

export interface SchemaFrontendResult {
  readonly graph?: CanonicalSchemaGraph;
  readonly diagnostics: DiagnosticBag;
  readonly declaredExtensions: readonly DeclaredExtensionOccurrence[];
}

interface ResourceRecord {
  readonly uri: string;
  readonly schema: JsonSchema;
  readonly schemaPath: SchemaPath;
  readonly anchors: Map<string, { readonly schema: JsonSchema; readonly pointer: string; readonly schemaPath: SchemaPath }>;
}

interface WalkFrame {
  readonly schema: JsonSchema;
  readonly schemaPath: SchemaPath;
  readonly resourceUri: string;
  readonly pointer: string;
  readonly baseUri: string;
}

export function runSchemaFrontend(
  schema: JsonSchema,
  environment?: FormEnvironment,
): SchemaFrontendResult {
  const diagnostics = new DiagnosticBag();
  const declaredExtensions: DeclaredExtensionOccurrence[] = [];
  if (environment === undefined) {
    if (!checkDialect(schema, diagnostics)) {
      return { diagnostics, declaredExtensions };
    }
  }
  const working = environment === undefined ? schema : convertRootDialect(schema, environment, diagnostics)?.schema;
  if (working === undefined) {
    return { diagnostics, declaredExtensions };
  }

  const resources = collectResources(working, diagnostics);
  const nodes = new Map<string, CanonicalSchemaNode>();
  const visiting = new Set<string>();
  walkSchema(
    {
      schema: working,
      schemaPath: ROOT_SCHEMA_PATH,
      resourceUri: resources.rootUri,
      pointer: "",
      baseUri: resources.rootUri,
    },
    resources,
    nodes,
    visiting,
    diagnostics,
    environment,
    declaredExtensions,
  );

  resolveReferences(nodes, resources, diagnostics);

  const graph: CanonicalSchemaGraph = {
    rootId: canonicalNodeId(resources.rootUri, ""),
    dialect: "draft-2020-12",
    nodes,
  };

  return { graph, diagnostics, declaredExtensions };
}

function checkDialect(schema: JsonSchema, diagnostics: DiagnosticBag): boolean {
  if (typeof schema === "boolean") {
    return true;
  }
  const declared = schema.$schema;
  if (declared === undefined) {
    return true;
  }
  if (typeof declared !== "string" || !isDraft202012Dialect(declared)) {
    diagnostics.push(
      schemaError(
        SCHEMA_DIAGNOSTIC_CODES.INVALID_DIALECT,
        `Unsupported JSON Schema dialect: ${String(declared)}`,
        childSchemaPath(ROOT_SCHEMA_PATH, "$schema"),
        { dialect: declared },
      ),
    );
    return false;
  }
  return true;
}

function collectResources(
  schema: JsonSchema,
  diagnostics: DiagnosticBag,
): { readonly rootUri: string; readonly byUri: Map<string, ResourceRecord> } {
  const byUri = new Map<string, ResourceRecord>();
  const rootUri =
    typeof schema === "object" && typeof schema.$id === "string" && !schema.$id.includes("#")
      ? isAbsoluteUri(schema.$id)
        ? splitUri(schema.$id).body
        : splitUri(resolveUri(DEFAULT_SCHEMA_BASE_URI, schema.$id)).body
      : DEFAULT_SCHEMA_BASE_URI;

  const visit = (
    current: JsonSchema,
    schemaPath: SchemaPath,
    baseUri: string,
    pointer: string,
    resource: ResourceRecord,
  ): void => {
    if (typeof current === "boolean") {
      return;
    }

    if (typeof current.$id === "string") {
      if (current.$id.includes("#")) {
        diagnostics.push(
          schemaError(
            SCHEMA_DIAGNOSTIC_CODES.INVALID_KEYWORD,
            "$id must not contain a fragment",
            childSchemaPath(schemaPath, "$id"),
            { keyword: "$id" },
          ),
        );
      } else {
        const uri = splitUri(resolveUri(baseUri, current.$id)).body;
        const next: ResourceRecord = {
          uri,
          schema: current,
          schemaPath,
          anchors: new Map(),
        };
        byUri.set(uri, next);
        resource = next;
        baseUri = uri;
        pointer = "";
      }
    }

    if (typeof current.$anchor === "string") {
      resource.anchors.set(current.$anchor, { schema: current, pointer, schemaPath });
    }

    visitKeywordChildren(current, schemaPath, (child, childPath, tokens) => {
      visit(child, childPath, baseUri, joinPointer(pointer, ...tokens), resource);
    });
  };

  const rootResource: ResourceRecord = {
    uri: rootUri,
    schema,
    schemaPath: ROOT_SCHEMA_PATH,
    anchors: new Map(),
  };
  byUri.set(rootUri, rootResource);
  visit(schema, ROOT_SCHEMA_PATH, rootUri, "", rootResource);
  return { rootUri, byUri };
}

function walkSchema(
  frame: WalkFrame,
  resources: { readonly rootUri: string; readonly byUri: Map<string, ResourceRecord> },
  nodes: Map<string, CanonicalSchemaNode>,
  visiting: Set<string>,
  diagnostics: DiagnosticBag,
  environment: FormEnvironment | undefined,
  declaredExtensions: DeclaredExtensionOccurrence[],
): string {
  let resourceUri = frame.resourceUri;
  let pointer = frame.pointer;
  let baseUri = frame.baseUri;
  const schema = frame.schema;

  if (typeof schema === "object" && typeof schema.$id === "string" && !schema.$id.includes("#")) {
    resourceUri = splitUri(resolveUri(baseUri, schema.$id)).body;
    pointer = "";
    baseUri = resourceUri;
  }

  const id = canonicalNodeId(resourceUri, pointer);
  if (nodes.has(id)) {
    return id;
  }
  if (visiting.has(id)) {
    return id;
  }
  visiting.add(id);

  if (typeof schema === "boolean") {
    nodes.set(id, {
      id,
      schemaPath: frame.schemaPath,
      resourceUri,
      pointer,
      booleanValue: schema,
      schema,
      anchors: [],
      childIds: {},
      extensionKeys: [],
    });
    visiting.delete(id);
    return id;
  }

  validateKeywords(schema, frame.schemaPath, diagnostics);
  warnEmbeddedDialect(schema, frame.schemaPath, diagnostics);

  const extensionIndex = environment === undefined ? undefined : buildSchemaExtensionIndex(environment);
  const extensionKeys = Object.keys(schema).filter(isExtensionKeyword);
  for (const key of extensionKeys) {
    const declared = extensionIndex?.get(key);
    if (declared !== undefined) {
      declaredExtensions.push({
        keyword: declared.extension.keyword,
        schemaPath: frame.schemaPath,
        value: deepFreezeValue((schema as Record<string, unknown>)[key]),
        extension: declared.extension,
        pluginId: declared.pluginId,
        key: declared.key,
      });
      continue;
    }
    diagnostics.push(
      schemaWarning(
        SCHEMA_DIAGNOSTIC_CODES.UNSUPPORTED_EXTENSION,
        `Undeclared extension keyword ${key} is not interpreted as UI, Rule, or Config`,
        childSchemaPath(frame.schemaPath, key),
        { keyword: key },
      ),
    );
  }

  for (const key of Object.keys(schema)) {
    if (!KNOWN_KEYWORDS.has(key) && !isExtensionKeyword(key)) {
      diagnostics.push(
        schemaWarning(
          SCHEMA_DIAGNOSTIC_CODES.GENERATION_UNSUPPORTED,
          `Unknown keyword ${key} is retained but not used for structure generation`,
          childSchemaPath(frame.schemaPath, key),
          { keyword: key },
        ),
      );
    }
  }

  if (typeof schema.$dynamicRef === "string") {
    diagnostics.push(
      schemaWarning(
        SCHEMA_DIAGNOSTIC_CODES.GENERATION_UNSUPPORTED,
        "$dynamicRef cannot be resolved statically in this compiler",
        childSchemaPath(frame.schemaPath, "$dynamicRef"),
        { keyword: "$dynamicRef", href: schema.$dynamicRef },
      ),
    );
  }

  const childIds: Record<string, string | string[]> = {};
  visitKeywordChildren(schema, frame.schemaPath, (child, childPath, tokens) => {
    const childId = walkSchema(
      {
        schema: child,
        schemaPath: childPath,
        resourceUri,
        pointer: joinPointer(pointer, ...tokens),
        baseUri,
      },
      resources,
      nodes,
      visiting,
      diagnostics,
      environment,
      declaredExtensions,
    );
    const key = tokens.join("/");
    const existing = childIds[key];
    if (existing === undefined) {
      childIds[key] = childId;
    } else if (typeof existing === "string") {
      childIds[key] = [existing, childId];
    } else {
      existing.push(childId);
    }
  });

  const anchors = typeof schema.$anchor === "string" ? [schema.$anchor] : [];
  const ref =
    typeof schema.$ref === "string"
      ? {
          href: schema.$ref,
          cycle: false,
          external: looksExternal(schema.$ref, baseUri, resources.byUri),
          unresolved: false,
        }
      : undefined;

  nodes.set(id, {
    id,
    schemaPath: frame.schemaPath,
    resourceUri,
    pointer,
    schema,
    ...(ref === undefined ? {} : { ref }),
    ...(typeof schema.$dynamicRef === "string" ? { dynamicRef: schema.$dynamicRef } : {}),
    anchors,
    childIds,
    extensionKeys,
  });
  visiting.delete(id);
  return id;
}

function resolveReferences(
  nodes: Map<string, CanonicalSchemaNode>,
  resources: { readonly rootUri: string; readonly byUri: Map<string, ResourceRecord> },
  diagnostics: DiagnosticBag,
): void {
  for (const [id, node] of nodes) {
    if (node.ref === undefined || typeof node.schema === "boolean") {
      continue;
    }
    const resolved = resolveRef(node.ref.href, node.resourceUri, node.schema, resources);
    if (resolved.unresolved || resolved.external) {
      diagnostics.push(
        schemaError(
          SCHEMA_DIAGNOSTIC_CODES.UNRESOLVED_REF,
          resolved.external
            ? `External $ref is not loaded: ${node.ref.href}`
            : `Unresolved $ref: ${node.ref.href}`,
          childSchemaPath(node.schemaPath, "$ref"),
          { href: node.ref.href },
        ),
      );
    }
    const cycle = resolved.targetId !== undefined && hasCycle(id, resolved.targetId, nodes);
    nodes.set(id, {
      ...node,
      ref: {
        href: node.ref.href,
        cycle,
        external: resolved.external,
        unresolved: resolved.unresolved,
        ...(resolved.targetId === undefined ? {} : { targetId: resolved.targetId }),
      },
    });
  }
}

function resolveRef(
  href: string,
  resourceUri: string,
  _schema: JsonSchemaObject,
  resources: { readonly byUri: Map<string, ResourceRecord> },
): { readonly targetId?: string; readonly unresolved: boolean; readonly external: boolean } {
  const absolute = resolveUri(resourceUri, href);
  const parts = splitUri(absolute);
  const resource = resources.byUri.get(parts.body);
  if (resource === undefined) {
    const localOnly = href.startsWith("#") || parts.body === resourceUri;
    return { unresolved: true, external: !localOnly };
  }

  if (!parts.hasFragment || isJsonPointerFragment(parts.fragment)) {
    const pointer = isJsonPointerFragment(parts.fragment) ? parts.fragment : "";
    const target = getAtPointer(resource.schema, pointer);
    if (!isJsonSchema(target)) {
      return { unresolved: true, external: false };
    }
    return { targetId: canonicalNodeId(resource.uri, pointer.replace(/^\//, "/")), unresolved: false, external: false };
  }

  const anchor = resource.anchors.get(parts.fragment);
  if (anchor === undefined) {
    return { unresolved: true, external: false };
  }
  return {
    targetId: canonicalNodeId(resource.uri, anchor.pointer),
    unresolved: false,
    external: false,
  };
}

function hasCycle(
  fromId: string,
  targetId: string,
  nodes: ReadonlyMap<string, CanonicalSchemaNode>,
): boolean {
  if (fromId === targetId) {
    return true;
  }
  const seen = new Set<string>();
  const stack = [targetId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === fromId) {
      return true;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    const node = nodes.get(current);
    if (node === undefined) {
      continue;
    }
    if (node.ref?.targetId !== undefined) {
      stack.push(node.ref.targetId);
    }
    for (const value of Object.values(node.childIds)) {
      if (typeof value === "string") {
        stack.push(value);
      } else {
        stack.push(...value);
      }
    }
  }
  return false;
}

function looksExternal(
  href: string,
  resourceUri: string,
  resources: ReadonlyMap<string, ResourceRecord>,
): boolean {
  if (href.startsWith("#")) {
    return false;
  }
  const absolute = splitUri(resolveUri(resourceUri, href)).body;
  return !resources.has(absolute);
}

function visitKeywordChildren(
  schema: JsonSchemaObject,
  schemaPath: SchemaPath,
  visit: (child: JsonSchema, childPath: SchemaPath, tokens: readonly string[]) => void,
): void {
  const mapKeywords = [
    "properties",
    "patternProperties",
    "dependentSchemas",
    "$defs",
  ] as const;
  for (const keyword of mapKeywords) {
    const value = schema[keyword];
    if (value === undefined || typeof value !== "object" || value === null) {
      continue;
    }
    for (const [name, child] of Object.entries(value)) {
      if (isJsonSchema(child)) {
        visit(child, childSchemaPath(childSchemaPath(schemaPath, keyword), name), [keyword, name]);
      }
    }
  }

  const schemaKeywords = [
    "items",
    "contains",
    "additionalProperties",
    "propertyNames",
    "unevaluatedItems",
    "unevaluatedProperties",
    "not",
    "if",
    "then",
    "else",
    "contentSchema",
  ] as const;
  for (const keyword of schemaKeywords) {
    const value = schema[keyword];
    if (isJsonSchema(value)) {
      visit(value, childSchemaPath(schemaPath, keyword), [keyword]);
    }
  }

  const arrayKeywords = ["allOf", "anyOf", "oneOf", "prefixItems"] as const;
  for (const keyword of arrayKeywords) {
    const value = schema[keyword];
    if (!Array.isArray(value)) {
      continue;
    }
    value.forEach((child, index) => {
      if (isJsonSchema(child)) {
        visit(child, childSchemaPath(childSchemaPath(schemaPath, keyword), String(index)), [
          keyword,
          String(index),
        ]);
      }
    });
  }
}

function joinPointer(parent: string, ...tokens: readonly string[]): string {
  let current = parent === "#" ? "" : parent;
  for (const token of tokens) {
    const escaped = token.replace(/~/g, "~0").replace(/\//g, "~1");
    current = current === "" ? `/${escaped}` : `${current.startsWith("/") ? current : `/${current}`}/${escaped}`;
  }
  return current;
}

function validateKeywords(schema: JsonSchemaObject, schemaPath: SchemaPath, diagnostics: DiagnosticBag): void {
  if (hasOwn(schema, "type")) {
    if (!isTypeValue(schema.type)) {
      diagnostics.push(invalidKeyword(schemaPath, "type", "type must be a JSON Schema type or array of unique types"));
    }
  }
  if (hasOwn(schema, "properties") && !isSchemaMap(schema.properties)) {
    diagnostics.push(invalidKeyword(schemaPath, "properties", "properties must be an object of schemas"));
  }
  if (hasOwn(schema, "required") && !isUniqueStringArray(schema.required)) {
    diagnostics.push(invalidKeyword(schemaPath, "required", "required must be an array of unique strings"));
  }
  if (hasOwn(schema, "prefixItems") && !isSchemaArray(schema.prefixItems)) {
    diagnostics.push(invalidKeyword(schemaPath, "prefixItems", "prefixItems must be an array of schemas"));
  }
  if (hasOwn(schema, "items") && !isJsonSchema(schema.items)) {
    diagnostics.push(invalidKeyword(schemaPath, "items", "items must be a schema"));
  }
  if (hasOwn(schema, "allOf") && !isNonEmptySchemaArray(schema.allOf)) {
    diagnostics.push(invalidKeyword(schemaPath, "allOf", "allOf must be a non-empty array of schemas"));
  }
  if (hasOwn(schema, "anyOf") && !isNonEmptySchemaArray(schema.anyOf)) {
    diagnostics.push(invalidKeyword(schemaPath, "anyOf", "anyOf must be a non-empty array of schemas"));
  }
  if (hasOwn(schema, "oneOf") && !isNonEmptySchemaArray(schema.oneOf)) {
    diagnostics.push(invalidKeyword(schemaPath, "oneOf", "oneOf must be a non-empty array of schemas"));
  }
  if (hasOwn(schema, "not") && !isJsonSchema(schema.not)) {
    diagnostics.push(invalidKeyword(schemaPath, "not", "not must be a schema"));
  }
  if (hasOwn(schema, "if") && !isJsonSchema(schema.if)) {
    diagnostics.push(invalidKeyword(schemaPath, "if", "if must be a schema"));
  }
  if (hasOwn(schema, "then") && !isJsonSchema(schema.then)) {
    diagnostics.push(invalidKeyword(schemaPath, "then", "then must be a schema"));
  }
  if (hasOwn(schema, "else") && !isJsonSchema(schema.else)) {
    diagnostics.push(invalidKeyword(schemaPath, "else", "else must be a schema"));
  }
  if (hasOwn(schema, "dependentSchemas") && !isSchemaMap(schema.dependentSchemas)) {
    diagnostics.push(
      invalidKeyword(schemaPath, "dependentSchemas", "dependentSchemas must be an object of schemas"),
    );
  }
  if (hasOwn(schema, "patternProperties") && !isSchemaMap(schema.patternProperties)) {
    diagnostics.push(
      invalidKeyword(schemaPath, "patternProperties", "patternProperties must be an object of schemas"),
    );
  }
  if (hasOwn(schema, "$defs") && !isSchemaMap(schema.$defs)) {
    diagnostics.push(invalidKeyword(schemaPath, "$defs", "$defs must be an object of schemas"));
  }
  if (hasOwn(schema, "enum") && !Array.isArray(schema.enum)) {
    diagnostics.push(invalidKeyword(schemaPath, "enum", "enum must be an array"));
  }
  if (hasOwn(schema, "format") && typeof schema.format !== "string") {
    diagnostics.push(invalidKeyword(schemaPath, "format", "format must be a string"));
  }
  if (hasOwn(schema, "multipleOf") && !(typeof schema.multipleOf === "number" && schema.multipleOf > 0)) {
    diagnostics.push(invalidKeyword(schemaPath, "multipleOf", "multipleOf must be a number greater than 0"));
  }
  for (const keyword of ["maxLength", "minLength", "maxItems", "minItems", "maxProperties", "minProperties"] as const) {
    if (hasOwn(schema, keyword) && !isNonNegativeInteger(schema[keyword])) {
      diagnostics.push(invalidKeyword(schemaPath, keyword, `${keyword} must be a non-negative integer`));
    }
  }
  if (hasOwn(schema, "uniqueItems") && typeof schema.uniqueItems !== "boolean") {
    diagnostics.push(invalidKeyword(schemaPath, "uniqueItems", "uniqueItems must be a boolean"));
  }
  if (hasOwn(schema, "dependentRequired") && !isStringArrayMap(schema.dependentRequired)) {
    diagnostics.push(
      invalidKeyword(schemaPath, "dependentRequired", "dependentRequired must map strings to unique string arrays"),
    );
  }
  if (hasOwn(schema, "$ref") && typeof schema.$ref !== "string") {
    diagnostics.push(invalidKeyword(schemaPath, "$ref", "$ref must be a URI-reference string"));
  }
  if (hasOwn(schema, "$anchor") && typeof schema.$anchor !== "string") {
    diagnostics.push(invalidKeyword(schemaPath, "$anchor", "$anchor must be a string"));
  }
  if (hasOwn(schema, "$id") && typeof schema.$id !== "string") {
    diagnostics.push(invalidKeyword(schemaPath, "$id", "$id must be a URI-reference string"));
  }
  if (hasOwn(schema, "$vocabulary") && !isBooleanMap(schema.$vocabulary)) {
    diagnostics.push(invalidKeyword(schemaPath, "$vocabulary", "$vocabulary must map URIs to booleans"));
  }

  for (const keyword of STRUCTURAL_OBJECT_KEYWORDS) {
    void keyword;
  }
  for (const keyword of STRUCTURAL_ARRAY_KEYWORDS) {
    void keyword;
  }
}

function invalidKeyword(schemaPath: SchemaPath, keyword: string, message: string) {
  return schemaError(SCHEMA_DIAGNOSTIC_CODES.INVALID_KEYWORD, message, childSchemaPath(schemaPath, keyword), {
    keyword,
  });
}

function isTypeValue(value: unknown): value is JsonSchemaType | readonly JsonSchemaType[] {
  if (typeof value === "string") {
    return (JSON_SCHEMA_TYPES as readonly string[]).includes(value);
  }
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !(JSON_SCHEMA_TYPES as readonly string[]).includes(item) || seen.has(item)) {
      return false;
    }
    seen.add(item);
  }
  return true;
}

function isSchemaMap(value: unknown): value is Readonly<Record<string, JsonSchema>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(isJsonSchema);
}

function isSchemaArray(value: unknown): value is readonly JsonSchema[] {
  return Array.isArray(value) && value.every(isJsonSchema);
}

function isNonEmptySchemaArray(value: unknown): value is readonly JsonSchema[] {
  return isSchemaArray(value) && value.length > 0;
}

function isUniqueStringArray(value: unknown): value is readonly string[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || seen.has(item)) {
      return false;
    }
    seen.add(item);
  }
  return true;
}

function isStringArrayMap(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(isUniqueStringArray);
}

function isBooleanMap(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((item) => typeof item === "boolean");
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function warnEmbeddedDialect(schema: JsonSchemaObject, schemaPath: SchemaPath, diagnostics: DiagnosticBag): void {
  if (schemaPath === ROOT_SCHEMA_PATH) {
    return;
  }
  const declared = schema.$schema;
  if (declared === undefined) {
    return;
  }
  if (typeof declared === "string" && isDraft202012Dialect(declared)) {
    return;
  }
  diagnostics.push(
    schemaWarning(
      SCHEMA_DIAGNOSTIC_CODES.EMBEDDED_DIALECT,
      `Embedded $schema dialect is not converted: ${String(declared)}`,
      childSchemaPath(schemaPath, "$schema"),
      { dialect: declared },
    ),
  );
}

function deepFreezeValue(value: unknown): JsonValue {
  return deepFreeze(clonePlain(value as JsonValue));
}

export function getChildId(
  node: CanonicalSchemaNode,
  token: string,
): string | undefined {
  const value = node.childIds[token];
  return typeof value === "string" ? value : value?.[0];
}

export function getChildIds(node: CanonicalSchemaNode, prefix: string): readonly string[] {
  const exact = node.childIds[prefix];
  if (typeof exact === "string") {
    return [exact];
  }
  if (Array.isArray(exact)) {
    return exact;
  }
  const matches: string[] = [];
  for (const [key, value] of Object.entries(node.childIds)) {
    if (key === prefix || key.startsWith(`${prefix}/`)) {
      if (typeof value === "string") {
        matches.push(value);
      } else {
        matches.push(...value);
      }
    }
  }
  return matches;
}

export function asObjectSchema(schema: JsonSchema): JsonSchemaObject | undefined {
  return isJsonSchemaObject(schema) ? schema : undefined;
}

export function schemaPathOf(node: CanonicalSchemaNode): SchemaPath {
  return node.schemaPath === undefined ? asSchemaPath("#") : node.schemaPath;
}
