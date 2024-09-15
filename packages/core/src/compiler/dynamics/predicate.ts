import type { JsonSchema, JsonSchemaObject } from "../../definition/json-schema.js";
import type { JsonValue } from "../../definition/json-value.js";
import type { ActivationPredicate } from "../../model/schema-dynamics.js";
import {
  ROOT_MODEL_PATH,
  childSchemaPath,
  joinModelPath,
  type ModelPath,
  type SchemaPath,
} from "../../path/index.js";
import type { CanonicalSchemaGraph, CanonicalSchemaNode } from "../schema/frontend.js";
import { asObjectSchema } from "../schema/frontend.js";
import { hasOwn, isJsonSchema, isJsonSchemaObject } from "../schema/keywords.js";
import { CloneShapeError, clonePlain } from "../immutable.js";

const UNSUPPORTED_KEYWORDS = new Set([
  "multipleOf",
  "maximum",
  "exclusiveMaximum",
  "minimum",
  "exclusiveMinimum",
  "maxLength",
  "minLength",
  "pattern",
  "format",
  "maxItems",
  "minItems",
  "uniqueItems",
  "maxContains",
  "minContains",
  "maxProperties",
  "minProperties",
  "dependentRequired",
  "additionalProperties",
  "patternProperties",
  "propertyNames",
  "unevaluatedItems",
  "unevaluatedProperties",
  "contains",
  "prefixItems",
  "items",
  "oneOf",
  "if",
  "then",
  "else",
  "dependentSchemas",
  "contentEncoding",
  "contentMediaType",
  "contentSchema",
]);

const IGNORED_KEYWORDS = new Set([
  "$id",
  "$schema",
  "$anchor",
  "$dynamicAnchor",
  "$vocabulary",
  "$comment",
  "$defs",
  "title",
  "description",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly",
  "examples",
]);

export interface PredicateCompileSuccess {
  readonly ok: true;
  readonly predicate: ActivationPredicate;
  readonly dependencies: readonly ModelPath[];
}

export interface PredicateCompileFailure {
  readonly ok: false;
  readonly reason: string;
  readonly schemaPath: SchemaPath;
  readonly keyword?: string;
}

export type PredicateCompileResult = PredicateCompileSuccess | PredicateCompileFailure;

export function compileActivationPredicate(
  schema: JsonSchema,
  schemaPath: SchemaPath,
  instancePath: ModelPath,
  graph: CanonicalSchemaGraph,
): PredicateCompileResult {
  const visiting = new Set<string>();
  return compileSchema(schema, schemaPath, instancePath, graph, visiting);
}

export function collectPredicateDependencies(predicate: ActivationPredicate): ModelPath[] {
  const paths: ModelPath[] = [];
  walkPredicate(predicate, (node) => {
    if (node.type === "type" || node.type === "const" || node.type === "enum" || node.type === "present") {
      paths.push(node.path);
    }
  });
  return uniquePaths(paths);
}

function compileSchema(
  schema: JsonSchema,
  schemaPath: SchemaPath,
  instancePath: ModelPath,
  graph: CanonicalSchemaGraph,
  visiting: Set<string>,
): PredicateCompileResult {
  if (schema === true) {
    return success({ type: "true" });
  }
  if (schema === false) {
    return success({ type: "false" });
  }
  if (!isJsonSchemaObject(schema)) {
    return fail(schemaPath, "Schema is not a supported activation predicate");
  }

  const visitKey = `${schemaPath}|${instancePath}`;
  if (visiting.has(visitKey)) {
    return fail(schemaPath, "Activation predicate contains a cycle");
  }
  visiting.add(visitKey);

  for (const key of Object.keys(schema)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) {
      visiting.delete(visitKey);
      return fail(schemaPath, `Activation cannot faithfully evaluate keyword "${key}"`, key);
    }
  }

  const parts: ActivationPredicate[] = [];
  const dependencies: ModelPath[] = [];

  if (typeof schema.$ref === "string") {
    const node = nodeAt(graph, schemaPath);
    const targetId = node?.ref?.targetId;
    const target = targetId === undefined ? undefined : graph.nodes.get(targetId);
    if (target === undefined) {
      visiting.delete(visitKey);
      return fail(childSchemaPath(schemaPath, "$ref"), "Activation $ref could not be resolved", "$ref");
    }
    const nested = compileSchema(target.schema, target.schemaPath, instancePath, graph, visiting);
    if (!nested.ok) {
      visiting.delete(visitKey);
      return nested;
    }
    parts.push(nested.predicate);
    dependencies.push(...nested.dependencies);
  }

  if (hasOwn(schema, "type") && schema.type !== undefined) {
    const types = typeof schema.type === "string" ? [schema.type] : [...schema.type];
    parts.push({ type: "type", path: instancePath, jsonTypes: Object.freeze(types) });
    dependencies.push(instancePath);
  }
  if (hasOwn(schema, "const")) {
    const value = jsonConst(schema.const, childSchemaPath(schemaPath, "const"));
    if (!value.ok) {
      visiting.delete(visitKey);
      return value;
    }
    parts.push({ type: "const", path: instancePath, value: value.value });
    dependencies.push(instancePath);
  }
  if (schema.enum !== undefined) {
    const values: JsonValue[] = [];
    for (let index = 0; index < schema.enum.length; index += 1) {
      const value = jsonConst(schema.enum[index], childSchemaPath(childSchemaPath(schemaPath, "enum"), String(index)));
      if (!value.ok) {
        visiting.delete(visitKey);
        return value;
      }
      values.push(value.value);
    }
    parts.push({ type: "enum", path: instancePath, values: Object.freeze(values) });
    dependencies.push(instancePath);
  }
  if (schema.required !== undefined) {
    for (const name of schema.required) {
      parts.push({ type: "present", path: instancePath, property: name });
      dependencies.push(instancePath);
    }
  }
  if (schema.properties !== undefined) {
    for (const [name, child] of Object.entries(schema.properties)) {
      if (!isJsonSchema(child)) {
        continue;
      }
      const childPath = joinModelPath(instancePath, { kind: "property", name });
      const nested = compileSchema(
        child,
        childSchemaPath(childSchemaPath(schemaPath, "properties"), name),
        childPath,
        graph,
        visiting,
      );
      if (!nested.ok) {
        visiting.delete(visitKey);
        return nested;
      }
      parts.push({
        type: "any",
        of: Object.freeze([
          { type: "not", of: { type: "present", path: instancePath, property: name } },
          nested.predicate,
        ]),
      });
      dependencies.push(instancePath, ...nested.dependencies);
    }
  }

  const applicator = compileApplicators(schema, schemaPath, instancePath, graph, visiting);
  if (!applicator.ok) {
    visiting.delete(visitKey);
    return applicator;
  }
  parts.push(...applicator.predicates);
  dependencies.push(...applicator.dependencies);

  visiting.delete(visitKey);
  return {
    ok: true,
    predicate: and(parts),
    dependencies: uniquePaths(dependencies),
  };
}

function compileApplicators(
  schema: JsonSchemaObject,
  schemaPath: SchemaPath,
  instancePath: ModelPath,
  graph: CanonicalSchemaGraph,
  visiting: Set<string>,
): { ok: true; predicates: ActivationPredicate[]; dependencies: ModelPath[] } | PredicateCompileFailure {
  const predicates: ActivationPredicate[] = [];
  const dependencies: ModelPath[] = [];
  if (schema.allOf !== undefined) {
    for (let index = 0; index < schema.allOf.length; index += 1) {
      const nested = compileSchema(
        schema.allOf[index]!,
        childSchemaPath(childSchemaPath(schemaPath, "allOf"), String(index)),
        instancePath,
        graph,
        visiting,
      );
      if (!nested.ok) {
        return nested;
      }
      predicates.push(nested.predicate);
      dependencies.push(...nested.dependencies);
    }
  }
  if (schema.anyOf !== undefined) {
    const options: ActivationPredicate[] = [];
    for (let index = 0; index < schema.anyOf.length; index += 1) {
      const nested = compileSchema(
        schema.anyOf[index]!,
        childSchemaPath(childSchemaPath(schemaPath, "anyOf"), String(index)),
        instancePath,
        graph,
        visiting,
      );
      if (!nested.ok) {
        return nested;
      }
      options.push(nested.predicate);
      dependencies.push(...nested.dependencies);
    }
    predicates.push(or(options));
  }
  if (schema.not !== undefined) {
    const nested = compileSchema(schema.not, childSchemaPath(schemaPath, "not"), instancePath, graph, visiting);
    if (!nested.ok) {
      return nested;
    }
    predicates.push({ type: "not", of: nested.predicate });
    dependencies.push(...nested.dependencies);
  }
  void asObjectSchema;
  return { ok: true, predicates, dependencies };
}

function jsonConst(
  value: unknown,
  schemaPath: SchemaPath,
): { ok: true; value: JsonValue } | PredicateCompileFailure {
  try {
    return { ok: true, value: clonePlain(value, true) as JsonValue };
  } catch (error) {
    const reason = error instanceof CloneShapeError ? error.reason : "non-json";
    return fail(schemaPath, `const/enum value is not JSON-compatible (${reason})`, "const");
  }
}

function nodeAt(graph: CanonicalSchemaGraph, schemaPath: SchemaPath): CanonicalSchemaNode | undefined {
  for (const node of graph.nodes.values()) {
    if (node.schemaPath === schemaPath) {
      return node;
    }
  }
  return undefined;
}

function success(predicate: ActivationPredicate): PredicateCompileSuccess {
  return { ok: true, predicate, dependencies: collectPredicateDependencies(predicate) };
}

function fail(schemaPath: SchemaPath, reason: string, keyword?: string): PredicateCompileFailure {
  return { ok: false, reason, schemaPath, ...(keyword === undefined ? {} : { keyword }) };
}

export function and(predicates: readonly ActivationPredicate[]): ActivationPredicate {
  const parts: ActivationPredicate[] = [];
  for (const predicate of predicates) {
    if (predicate.type === "false") {
      return { type: "false" };
    }
    if (predicate.type === "true") {
      continue;
    }
    if (predicate.type === "all") {
      parts.push(...predicate.of);
    } else {
      parts.push(predicate);
    }
  }
  if (parts.length === 0) {
    return { type: "true" };
  }
  if (parts.length === 1) {
    return parts[0]!;
  }
  return { type: "all", of: Object.freeze(parts) };
}

export function or(predicates: readonly ActivationPredicate[]): ActivationPredicate {
  const parts: ActivationPredicate[] = [];
  for (const predicate of predicates) {
    if (predicate.type === "true") {
      return { type: "true" };
    }
    if (predicate.type === "false") {
      continue;
    }
    if (predicate.type === "any") {
      parts.push(...predicate.of);
    } else {
      parts.push(predicate);
    }
  }
  if (parts.length === 0) {
    return { type: "false" };
  }
  if (parts.length === 1) {
    return parts[0]!;
  }
  return { type: "any", of: Object.freeze(parts) };
}

function walkPredicate(predicate: ActivationPredicate, visit: (node: ActivationPredicate) => void): void {
  visit(predicate);
  if (predicate.type === "all" || predicate.type === "any") {
    for (const child of predicate.of) {
      walkPredicate(child, visit);
    }
  } else if (predicate.type === "not") {
    walkPredicate(predicate.of, visit);
  }
}

function uniquePaths(paths: readonly ModelPath[]): ModelPath[] {
  const seen = new Set<string>();
  const result: ModelPath[] = [];
  for (const path of paths) {
    if (!seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
}

export { ROOT_MODEL_PATH };
