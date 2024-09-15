import type { JsonSchemaObject, JsonSchemaType } from "../../definition/json-schema.js";
import type { PropertyOrigin, PropertyRequiredStatus } from "../../model/data.js";
import { SCHEMA_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import { childSchemaPath, type SchemaPath } from "../../path/index.js";
import { DiagnosticBag, schemaError, schemaWarning } from "../diagnostics.js";
import {
  type CanonicalSchemaGraph,
  type CanonicalSchemaNode,
  asObjectSchema,
  getChildId,
  getChildIds,
} from "../schema/frontend.js";
import {
  STRUCTURAL_ARRAY_KEYWORDS,
  STRUCTURAL_OBJECT_KEYWORDS,
  hasOwn,
} from "../schema/keywords.js";
import {
  type ArrayShape,
  type DataShape,
  type ObjectPropertyShape,
  type ObjectShape,
  type ScalarShape,
  type UnionShape,
  anyShape,
  isScalarJsonType,
  neverShape,
} from "./types.js";

export interface ShapeAnalysis {
  readonly root: DataShape;
  readonly byNodeId: ReadonlyMap<string, DataShape>;
}

export function analyzeShapes(graph: CanonicalSchemaGraph, diagnostics: DiagnosticBag): ShapeAnalysis {
  const byNodeId = new Map<string, DataShape>();
  const visiting = new Set<string>();
  const root = analyzeNode(graph.rootId, graph, diagnostics, byNodeId, visiting);
  return { root, byNodeId };
}

function analyzeNode(
  nodeId: string,
  graph: CanonicalSchemaGraph,
  diagnostics: DiagnosticBag,
  memo: Map<string, DataShape>,
  visiting: Set<string>,
): DataShape {
  const cached = memo.get(nodeId);
  if (cached !== undefined) {
    return cached;
  }
  if (visiting.has(nodeId)) {
    return {
      kind: "recursive-ref",
      targetId: nodeId,
      schemaRefs: [graph.nodes.get(nodeId)?.schemaPath ?? (graph.nodes.get(graph.rootId)?.schemaPath)!],
    };
  }

  const node = graph.nodes.get(nodeId);
  if (node === undefined) {
    return anyShape([]);
  }

  visiting.add(nodeId);
  const shape = analyzeLocated(node, graph, diagnostics, memo, visiting);
  visiting.delete(nodeId);
  const tagged: DataShape = { ...shape, graphId: shape.graphId ?? nodeId };
  memo.set(nodeId, tagged);
  return tagged;
}

function analyzeLocated(
  node: CanonicalSchemaNode,
  graph: CanonicalSchemaGraph,
  diagnostics: DiagnosticBag,
  memo: Map<string, DataShape>,
  visiting: Set<string>,
): DataShape {
  if (node.booleanValue === true) {
    return anyShape([node.schemaPath]);
  }
  if (node.booleanValue === false) {
    return neverShape([node.schemaPath]);
  }

  const schema = asObjectSchema(node.schema);
  if (schema === undefined) {
    return anyShape([node.schemaPath]);
  }

  const parts: DataShape[] = [];

  if (node.ref?.targetId !== undefined && !node.ref.unresolved) {
    if (node.ref.cycle || visiting.has(node.ref.targetId) || node.ref.targetId === node.id) {
      parts.push({
        kind: "recursive-ref",
        targetId: node.ref.targetId,
        schemaRefs: [node.schemaPath],
      });
    } else {
      parts.push(analyzeNode(node.ref.targetId, graph, diagnostics, memo, visiting));
    }
  }

  const local = analyzeKeywords(node, schema, graph, diagnostics, memo, visiting);
  parts.push(local);

  if (parts.length === 1) {
    return parts[0]!;
  }
  return combineAllOf(parts, node.schemaPath, diagnostics);
}

function analyzeKeywords(
  node: CanonicalSchemaNode,
  schema: JsonSchemaObject,
  graph: CanonicalSchemaGraph,
  diagnostics: DiagnosticBag,
  memo: Map<string, DataShape>,
  visiting: Set<string>,
): DataShape {
  const refs = [node.schemaPath];
  const applicators: DataShape[] = [];

  const allOfIds = indexedChildIds(node, "allOf");
  if (allOfIds.length > 0) {
    applicators.push(
      combineAllOf(
        allOfIds.map((id) => analyzeNode(id, graph, diagnostics, memo, visiting)),
        node.schemaPath,
        diagnostics,
      ),
    );
  }

  const oneOfIds = indexedChildIds(node, "oneOf");
  if (oneOfIds.length > 0) {
    applicators.push({
      kind: "union",
      provenance: "oneOf",
      variants: oneOfIds.map((id) => analyzeNode(id, graph, diagnostics, memo, visiting)),
      schemaRefs: refs,
    });
  }

  const anyOfIds = indexedChildIds(node, "anyOf");
  if (anyOfIds.length > 0) {
    applicators.push({
      kind: "union",
      provenance: "anyOf",
      variants: anyOfIds.map((id) => analyzeNode(id, graph, diagnostics, memo, visiting)),
      schemaRefs: refs,
    });
  }

  const base = analyzeBaseShape(node, schema, graph, diagnostics, memo, visiting);
  const withConditionals = applyConditionals(node, schema, base, graph, diagnostics, memo, visiting);

  const combined = [withConditionals, ...applicators];
  return combineAllOf(combined, node.schemaPath, diagnostics);
}

function analyzeBaseShape(
  node: CanonicalSchemaNode,
  schema: JsonSchemaObject,
  graph: CanonicalSchemaGraph,
  diagnostics: DiagnosticBag,
  memo: Map<string, DataShape>,
  visiting: Set<string>,
): DataShape {
  const refs = [node.schemaPath];
  const types = normalizeTypes(schema.type);
  const inferred = schema.type === undefined;
  const objectHint = hasAny(schema, STRUCTURAL_OBJECT_KEYWORDS);
  const arrayHint = hasAny(schema, STRUCTURAL_ARRAY_KEYWORDS);

  if (types.length === 0) {
    if (objectHint && !arrayHint) {
      if (inferred) {
        diagnostics.push(
          schemaWarning(
            SCHEMA_DIAGNOSTIC_CODES.SHAPE_INFERRED,
            "Object shape was inferred from structural keywords",
            node.schemaPath,
            { keyword: "properties" },
          ),
        );
      }
      return buildObjectShape(node, schema, graph, diagnostics, memo, visiting, inferred);
    }
    if (arrayHint && !objectHint) {
      if (inferred) {
        diagnostics.push(
          schemaWarning(
            SCHEMA_DIAGNOSTIC_CODES.SHAPE_INFERRED,
            "Array shape was inferred from structural keywords",
            node.schemaPath,
            { keyword: schema.prefixItems !== undefined ? "prefixItems" : "items" },
          ),
        );
      }
      return buildArrayShape(node, schema, graph, diagnostics, memo, visiting, inferred);
    }
    if (objectHint && arrayHint) {
      diagnostics.push(
        schemaWarning(
          SCHEMA_DIAGNOSTIC_CODES.GENERATION_UNSUPPORTED,
          "Structural keywords imply both object and array; using a union",
          node.schemaPath,
        ),
      );
      return {
        kind: "union",
        provenance: "conflict",
        variants: [
          buildObjectShape(node, schema, graph, diagnostics, memo, visiting, true),
          buildArrayShape(node, schema, graph, diagnostics, memo, visiting, true),
        ],
        schemaRefs: refs,
        inferred: true,
      };
    }
    return attachScalarMetadata(anyShape(refs), schema);
  }

  const nullable = types.includes("null");
  const nonNull = types.filter((type) => type !== "null");

  if (nonNull.length === 0) {
    return {
      kind: "scalar",
      valueType: "null",
      nullable: true,
      schemaRefs: refs,
      ...scalarMeta(schema),
    };
  }

  const variants: DataShape[] = nonNull.map((type) => {
    if (type === "object") {
      return buildObjectShape(node, schema, graph, diagnostics, memo, visiting, false);
    }
    if (type === "array") {
      return buildArrayShape(node, schema, graph, diagnostics, memo, visiting, false);
    }
    const scalar: ScalarShape = {
      kind: "scalar",
      valueType: type,
      nullable,
      schemaRefs: refs,
      ...scalarMeta(schema),
    };
    return scalar;
  });

  if (variants.length === 1) {
    const only = variants[0]!;
    if (only.kind === "scalar") {
      return { ...only, nullable: only.nullable || nullable };
    }
    return only;
  }

  return {
    kind: "union",
    provenance: "type",
    variants,
    schemaRefs: refs,
  };
}

function buildObjectShape(
  node: CanonicalSchemaNode,
  schema: JsonSchemaObject,
  graph: CanonicalSchemaGraph,
  diagnostics: DiagnosticBag,
  memo: Map<string, DataShape>,
  visiting: Set<string>,
  inferred: boolean,
): ObjectShape {
  const required = new Set(schema.required ?? []);
  const properties: ObjectPropertyShape[] = [];
  const seen = new Set<string>();

  for (const name of Object.keys(schema.properties ?? {})) {
    const childId = getChildId(node, `properties/${name}`);
    const shape =
      childId === undefined
        ? anyShape([childSchemaPath(childSchemaPath(node.schemaPath, "properties"), name)])
        : analyzeNode(childId, graph, diagnostics, memo, visiting);
    seen.add(name);
    properties.push({
      name,
      required: required.has(name) ? "required" : "optional",
      origin: "properties",
      shape,
      schemaRefs: [childSchemaPath(childSchemaPath(node.schemaPath, "properties"), name)],
    });
  }

  if (schema.patternProperties !== undefined) {
    diagnostics.push(
      schemaWarning(
        SCHEMA_DIAGNOSTIC_CODES.GENERATION_UNSUPPORTED,
        "patternProperties cannot enumerate static field names",
        childSchemaPath(node.schemaPath, "patternProperties"),
        { keyword: "patternProperties" },
      ),
    );
  }

  void seen;
  return {
    kind: "object",
    properties,
    schemaRefs: [node.schemaPath],
    ...(inferred ? { inferred: true } : {}),
  };
}

function buildArrayShape(
  node: CanonicalSchemaNode,
  schema: JsonSchemaObject,
  graph: CanonicalSchemaGraph,
  diagnostics: DiagnosticBag,
  memo: Map<string, DataShape>,
  visiting: Set<string>,
  inferred: boolean,
): ArrayShape {
  const prefixIds = indexedChildIds(node, "prefixItems");
  const itemsId = getChildId(node, "items");
  const prefixItems =
    prefixIds.length > 0
      ? prefixIds.map((id) => analyzeNode(id, graph, diagnostics, memo, visiting))
      : undefined;
  const items = itemsId === undefined ? undefined : analyzeNode(itemsId, graph, diagnostics, memo, visiting);
  const form: "list" | "tuple" = prefixItems !== undefined ? "tuple" : "list";

  return {
    kind: "array",
    form,
    schemaRefs: [node.schemaPath],
    ...(prefixItems === undefined ? {} : { prefixItems }),
    ...(items === undefined ? {} : { items }),
    ...(inferred ? { inferred: true } : {}),
  };
}

function applyConditionals(
  node: CanonicalSchemaNode,
  schema: JsonSchemaObject,
  base: DataShape,
  graph: CanonicalSchemaGraph,
  diagnostics: DiagnosticBag,
  memo: Map<string, DataShape>,
  visiting: Set<string>,
): DataShape {
  let current = base;

  const thenId = getChildId(node, "then");
  const elseId = getChildId(node, "else");
  if (thenId !== undefined || elseId !== undefined) {
    const thenShape = thenId === undefined ? undefined : analyzeNode(thenId, graph, diagnostics, memo, visiting);
    const elseShape = elseId === undefined ? undefined : analyzeNode(elseId, graph, diagnostics, memo, visiting);
    current = mergeConditional(current, thenShape, "if-then", node.schemaPath, diagnostics);
    current = mergeConditional(current, elseShape, "if-else", node.schemaPath, diagnostics);
  }

  const dependentIds = Object.keys(schema.dependentSchemas ?? {}).map((name) => ({
    name,
    id: getChildId(node, `dependentSchemas/${name}`),
  }));
  for (const entry of dependentIds) {
    if (entry.id === undefined) {
      continue;
    }
    current = mergeConditional(
      current,
      analyzeNode(entry.id, graph, diagnostics, memo, visiting),
      "dependentSchemas",
      node.schemaPath,
      diagnostics,
    );
  }

  return current;
}

function mergeConditional(
  base: DataShape,
  branch: DataShape | undefined,
  origin: PropertyOrigin,
  schemaPath: SchemaPath,
  diagnostics: DiagnosticBag,
): DataShape {
  if (branch === undefined) {
    return base;
  }
  if (branch.kind === "object") {
    const objectBase = ensureObject(base, schemaPath, diagnostics);
    return mergeObjectProperties(objectBase, markConditional(branch, origin), schemaPath, diagnostics, origin);
  }
  if (base.kind === "object" && (branch.kind === "union" || branch.kind === "any")) {
    return combineAllOf([base, branch], schemaPath, diagnostics);
  }
  return combineAllOf([base, branch], schemaPath, diagnostics);
}

function markConditional(shape: ObjectShape, origin: PropertyOrigin): ObjectShape {
  return {
    ...shape,
    properties: shape.properties.map((property) => ({
      ...property,
      required: property.required === "required" ? "conditional" : property.required === "optional" ? "conditional" : property.required,
      origin,
    })),
  };
}

function ensureObject(shape: DataShape, schemaPath: SchemaPath, diagnostics: DiagnosticBag): ObjectShape {
  if (shape.kind === "object") {
    return shape;
  }
  if (shape.kind === "any") {
    return { kind: "object", properties: [], schemaRefs: shape.schemaRefs };
  }
  diagnostics.push(
    schemaWarning(
      SCHEMA_DIAGNOSTIC_CODES.GENERATION_UNSUPPORTED,
      "Conditional applicator added object structure onto a non-object shape",
      schemaPath,
    ),
  );
  return { kind: "object", properties: [], schemaRefs: shape.schemaRefs };
}

function combineAllOf(shapes: readonly DataShape[], schemaPath: SchemaPath, diagnostics: DiagnosticBag): DataShape {
  return shapes.reduce((left, right) => combinePair(left, right, schemaPath, diagnostics));
}

function combinePair(
  left: DataShape,
  right: DataShape,
  schemaPath: SchemaPath,
  diagnostics: DiagnosticBag,
): DataShape {
  if (left.kind === "any") {
    return right.kind === "any" ? left : right;
  }
  if (right.kind === "any") {
    return left;
  }
  if (left.kind === "never") {
    return left;
  }
  if (right.kind === "never") {
    return right;
  }
  if (left.kind === "recursive-ref") {
    return left;
  }
  if (right.kind === "recursive-ref") {
    return right;
  }
  if (left.kind === "union" || right.kind === "union") {
    return {
      kind: "union",
      provenance: left.kind === "union" ? left.provenance : right.kind === "union" ? right.provenance : "conflict",
      variants: [...variantsOf(left), ...variantsOf(right)],
      schemaRefs: mergeRefs(left.schemaRefs, right.schemaRefs),
    };
  }
  if (left.kind === "object" && right.kind === "object") {
    return mergeObjectProperties(left, right, schemaPath, diagnostics, "allOf");
  }
  if (left.kind === "array" && right.kind === "array") {
    return mergeArrays(left, right, schemaPath, diagnostics);
  }
  if (left.kind === "scalar" && right.kind === "scalar") {
    if (left.valueType === right.valueType || (numeric(left) && numeric(right))) {
      return {
        kind: "scalar",
        valueType: left.valueType === "integer" || right.valueType === "integer" ? "integer" : left.valueType,
        nullable: left.nullable && right.nullable,
        schemaRefs: mergeRefs(left.schemaRefs, right.schemaRefs),
        ...mergeScalarMeta(left, right),
      };
    }
    return neverShape(mergeRefs(left.schemaRefs, right.schemaRefs));
  }
  diagnostics.push(
    schemaError(
      SCHEMA_DIAGNOSTIC_CODES.GENERATION_UNSUPPORTED,
      "Cannot faithfully combine conflicting shapes at the same location",
      schemaPath,
      { left: left.kind, right: right.kind },
    ),
  );
  return {
    kind: "union",
    provenance: "conflict",
    variants: [left, right],
    schemaRefs: mergeRefs(left.schemaRefs, right.schemaRefs),
  };
}

function mergeObjectProperties(
  left: ObjectShape,
  right: ObjectShape,
  schemaPath: SchemaPath,
  diagnostics: DiagnosticBag,
  origin: PropertyOrigin,
): ObjectShape {
  const order: string[] = [];
  const map = new Map<string, ObjectPropertyShape>();

  const add = (property: ObjectPropertyShape): void => {
    const existing = map.get(property.name);
    if (existing === undefined) {
      map.set(property.name, property);
      order.push(property.name);
      return;
    }
    const combined = combinePair(existing.shape, property.shape, schemaPath, diagnostics);
    map.set(property.name, {
      name: property.name,
      required: mergeRequired(existing.required, property.required),
      origin: existing.origin,
      shape: combined,
      schemaRefs: mergeRefs(existing.schemaRefs, property.schemaRefs),
    });
  };

  for (const property of left.properties) {
    add(property);
  }
  for (const property of right.properties) {
    add({ ...property, origin: property.origin === "properties" ? origin : property.origin });
  }

  return {
    kind: "object",
    properties: order.map((name) => map.get(name)!),
    schemaRefs: mergeRefs(left.schemaRefs, right.schemaRefs),
  };
}

function mergeArrays(
  left: ArrayShape,
  right: ArrayShape,
  schemaPath: SchemaPath,
  diagnostics: DiagnosticBag,
): ArrayShape {
  const form = left.form === "tuple" || right.form === "tuple" ? "tuple" : "list";
  const prefixItems = mergePrefix(left.prefixItems, right.prefixItems, schemaPath, diagnostics);
  const items =
    left.items === undefined
      ? right.items
      : right.items === undefined
        ? left.items
        : combinePair(left.items, right.items, schemaPath, diagnostics);
  return {
    kind: "array",
    form,
    schemaRefs: mergeRefs(left.schemaRefs, right.schemaRefs),
    ...(prefixItems === undefined ? {} : { prefixItems }),
    ...(items === undefined ? {} : { items }),
  };
}

function mergePrefix(
  left: readonly DataShape[] | undefined,
  right: readonly DataShape[] | undefined,
  schemaPath: SchemaPath,
  diagnostics: DiagnosticBag,
): readonly DataShape[] | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  const length = Math.max(left.length, right.length);
  const merged: DataShape[] = [];
  for (let index = 0; index < length; index += 1) {
    const l = left[index];
    const r = right[index];
    if (l === undefined) {
      merged.push(r!);
    } else if (r === undefined) {
      merged.push(l);
    } else {
      merged.push(combinePair(l, r, schemaPath, diagnostics));
    }
  }
  return merged;
}

function mergeRequired(
  left: PropertyRequiredStatus,
  right: PropertyRequiredStatus,
): PropertyRequiredStatus {
  if (left === "required" || right === "required") {
    return "required";
  }
  if (left === "conditional" || right === "conditional") {
    return "conditional";
  }
  return "optional";
}

function variantsOf(shape: DataShape): readonly DataShape[] {
  return shape.kind === "union" ? shape.variants : [shape];
}

function mergeRefs(left: readonly SchemaPath[], right: readonly SchemaPath[]): readonly SchemaPath[] {
  const seen = new Set<string>();
  const result: SchemaPath[] = [];
  for (const ref of [...left, ...right]) {
    if (!seen.has(ref)) {
      seen.add(ref);
      result.push(ref);
    }
  }
  return result;
}

function indexedChildIds(node: CanonicalSchemaNode, keyword: string): readonly string[] {
  return getChildIds(node, keyword).filter((id, index, all) => {
    const keyMatch = Object.entries(node.childIds).filter(([key]) => key === keyword || key.startsWith(`${keyword}/`));
    void id;
    void index;
    void all;
    return keyMatch.length >= 0;
  }).length > 0
    ? Object.entries(node.childIds)
        .filter(([key]) => key.startsWith(`${keyword}/`))
        .sort(([left], [right]) => left.localeCompare(right, "en", { numeric: true }))
        .flatMap(([, value]) => (typeof value === "string" ? [value] : value))
    : [];
}

function normalizeTypes(type: JsonSchemaObject["type"]): JsonSchemaType[] {
  if (type === undefined) {
    return [];
  }
  return typeof type === "string" ? [type] : [...type];
}

function hasAny(schema: JsonSchemaObject, keys: readonly string[]): boolean {
  return keys.some((key) => hasOwn(schema, key));
}

function scalarMeta(schema: JsonSchemaObject): Pick<ScalarShape, "enum" | "const" | "format"> {
  return {
    ...(schema.enum === undefined ? {} : { enum: schema.enum }),
    ...(hasOwn(schema, "const") ? { const: schema.const } : {}),
    ...(schema.format === undefined ? {} : { format: schema.format }),
  };
}

function attachScalarMetadata(shape: DataShape, schema: JsonSchemaObject): DataShape {
  if (shape.kind !== "any") {
    return shape;
  }
  const meta = scalarMeta(schema);
  if (meta.enum === undefined && meta.const === undefined && meta.format === undefined) {
    return shape;
  }
  return shape;
}

function mergeScalarMeta(
  left: ScalarShape,
  right: ScalarShape,
): Pick<ScalarShape, "enum" | "const" | "format"> {
  return {
    ...(left.enum !== undefined || right.enum !== undefined ? { enum: left.enum ?? right.enum } : {}),
    ...(left.const !== undefined || right.const !== undefined ? { const: left.const ?? right.const } : {}),
    ...(left.format !== undefined || right.format !== undefined ? { format: left.format ?? right.format } : {}),
  };
}

function numeric(shape: ScalarShape): boolean {
  return shape.valueType === "number" || shape.valueType === "integer";
}

export function isObjectShape(shape: DataShape): shape is ObjectShape {
  return shape.kind === "object";
}

export function isUnionShape(shape: DataShape): shape is UnionShape {
  return shape.kind === "union";
}
