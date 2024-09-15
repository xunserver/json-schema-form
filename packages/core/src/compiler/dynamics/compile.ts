import type { JsonSchema, JsonSchemaObject } from "../../definition/json-schema.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import type { DataModel, DataNode } from "../../model/data/data.js";
import type {
  ActivationBranch,
  ActivationPlan,
  SchemaActivation,
  SchemaDynamics,
} from "../../model/schema-dynamics/schema-dynamics.js";
import { createReadonlyKeyedCollection } from "../../model/readonly-collection.js";
import {
  ROOT_MODEL_PATH,
  childSchemaPath,
  joinModelPath,
  type ModelPath,
  type SchemaPath,
} from "../../model/path/index.js";
import { DiagnosticBag, compilerError } from "../diagnostics.js";
import { deepFreeze } from "../immutable.js";
import type { CanonicalSchemaGraph, CanonicalSchemaNode } from "../schema/frontend.js";
import { isJsonSchema, isJsonSchemaObject } from "../../schema/keywords.js";
import {
  collectPredicateDependencies,
  compileActivationPredicate,
  type PredicateCompileResult,
} from "./predicate.js";

export interface DynamicsCompileResult {
  readonly model?: SchemaDynamics;
}

export function compileSchemaDynamics(
  graph: CanonicalSchemaGraph,
  data: DataModel,
  diagnostics: DiagnosticBag,
): DynamicsCompileResult {
  const plans: ActivationPlan[] = [];
  const activations: SchemaActivation[] = [];
  const seen = new Set<string>();

  for (const node of data.nodes.values()) {
    for (const schemaPath of uniqueSchemaRefs(node)) {
      const schemaNode = findSchemaNode(graph, schemaPath);
      if (schemaNode === undefined) {
        continue;
      }
      const key = `${schemaNode.id}|${node.path}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      compileAt(schemaNode, node.path, graph, diagnostics, plans, activations);
    }
  }

  if (diagnostics.hasErrors()) {
    return {};
  }

  const byPath = buildByPath(plans);
  const model: SchemaDynamics = deepFreeze({
    activations,
    plans,
    byPath: createReadonlyKeyedCollection(byPath),
  });
  return { model };
}

function compileAt(
  schemaNode: CanonicalSchemaNode,
  ownerPath: ModelPath,
  graph: CanonicalSchemaGraph,
  diagnostics: DiagnosticBag,
  plans: ActivationPlan[],
  activations: SchemaActivation[],
): void {
  const schema = schemaNode.schema;
  if (!isJsonSchemaObject(schema)) {
    return;
  }

  if (schema.oneOf !== undefined) {
    compileUnionPlan("oneOf", schema, schemaNode, ownerPath, graph, diagnostics, plans, activations);
  }
  if (schema.anyOf !== undefined) {
    compileUnionPlan("anyOf", schema, schemaNode, ownerPath, graph, diagnostics, plans, activations);
  }
  if (schema.if !== undefined || schema.then !== undefined || schema.else !== undefined) {
    compileIfPlan(schema, schemaNode, ownerPath, graph, diagnostics, plans, activations);
  }
  if (schema.dependentSchemas !== undefined) {
    compileDependentPlan(schema, schemaNode, ownerPath, graph, diagnostics, plans, activations);
  }
}

function compileUnionPlan(
  kind: "oneOf" | "anyOf",
  schema: JsonSchemaObject,
  schemaNode: CanonicalSchemaNode,
  ownerPath: ModelPath,
  graph: CanonicalSchemaGraph,
  diagnostics: DiagnosticBag,
  plans: ActivationPlan[],
  activations: SchemaActivation[],
): void {
  const branchesSchema = kind === "oneOf" ? schema.oneOf : schema.anyOf;
  if (branchesSchema === undefined) {
    return;
  }
  const baseNodes = collectBasePaths(schema, ownerPath);
  const compiledBranches: ActivationBranch[] = [];
  const allBranchPaths: ModelPath[][] = [];

  for (let index = 0; index < branchesSchema.length; index += 1) {
    const branchSchema = branchesSchema[index]!;
    const branchPath = childSchemaPath(childSchemaPath(schemaNode.schemaPath, kind), String(index));
    const predicate = compileActivationPredicate(branchSchema, branchPath, ownerPath, graph);
    if (!pushPredicateError(predicate, diagnostics, ownerPath)) {
      continue;
    }
    const nodes = collectStructuralPaths(branchSchema, ownerPath);
    allBranchPaths.push(nodes);
    compiledBranches.push({
      id: `${kind}:${ownerPath || "root"}:${index}`,
      schemaPath: branchPath,
      nodes,
      exclusiveNodes: [],
      sharedNodes: [],
      predicate: predicate.predicate,
      dependencies: predicate.dependencies,
    });
  }

  if (compiledBranches.length !== branchesSchema.length) {
    return;
  }

  if (kind === "oneOf" && compiledBranches.some((branch) => !isDiscriminatingPredicate(branch.predicate))) {
    diagnostics.push(
      compilerError(
        COMPILER_DIAGNOSTIC_CODES.DYNAMICS_AMBIGUOUS,
        "oneOf branches do not export a safe discriminator predicate",
        {
          schemaPath: schemaNode.schemaPath,
          modelPath: ownerPath,
        },
      ),
    );
  }

  const counts = new Map<string, number>();
  for (const nodes of allBranchPaths) {
    for (const path of unique(nodes)) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  const baseSet = new Set(baseNodes);
  const branches = compiledBranches.map((branch, index) => {
    const exclusive: ModelPath[] = [];
    const shared: ModelPath[] = [];
    for (const path of unique(allBranchPaths[index] ?? [])) {
      if (baseSet.has(path) || (counts.get(path) ?? 0) > 1) {
        shared.push(path);
      } else {
        exclusive.push(path);
      }
    }
    const resolved: ActivationBranch = {
      ...branch,
      exclusiveNodes: Object.freeze(exclusive),
      sharedNodes: Object.freeze(shared),
      nodes: Object.freeze(unique(allBranchPaths[index] ?? [])),
    };
    for (const path of resolved.exclusiveNodes) {
      activations.push({ path, schemaPath: resolved.schemaPath });
    }
    return resolved;
  });

  const dependencies = unique(branches.flatMap((branch) => [...branch.dependencies]));
  plans.push({
    id: `${kind}:${ownerPath || "root"}:${schemaNode.schemaPath}`,
    kind,
    ownerPath,
    schemaPath: schemaNode.schemaPath,
    baseNodes: Object.freeze(baseNodes),
    branches: Object.freeze(branches),
    dependencies: Object.freeze(dependencies),
  });
}

function compileIfPlan(
  schema: JsonSchemaObject,
  schemaNode: CanonicalSchemaNode,
  ownerPath: ModelPath,
  graph: CanonicalSchemaGraph,
  diagnostics: DiagnosticBag,
  plans: ActivationPlan[],
  activations: SchemaActivation[],
): void {
  const ifSchema = schema.if ?? true;
  const ifPath = childSchemaPath(schemaNode.schemaPath, "if");
  const predicate = compileActivationPredicate(ifSchema, schema.if === undefined ? schemaNode.schemaPath : ifPath, ownerPath, graph);
  if (!pushPredicateError(predicate, diagnostics, ownerPath)) {
    return;
  }
  const baseNodes = collectBasePaths(schema, ownerPath);
  const branches: ActivationBranch[] = [];
  if (schema.then !== undefined) {
    const thenPath = childSchemaPath(schemaNode.schemaPath, "then");
    const nodes = collectStructuralPaths(schema.then, ownerPath);
    branches.push({
      id: `if:${ownerPath || "root"}:then`,
      schemaPath: thenPath,
      nodes: Object.freeze(nodes),
      exclusiveNodes: Object.freeze(nodes.filter((path) => !baseNodes.includes(path))),
      sharedNodes: Object.freeze(nodes.filter((path) => baseNodes.includes(path))),
      predicate: predicate.predicate,
      dependencies: predicate.dependencies,
    });
  }
  if (schema.else !== undefined) {
    const elsePath = childSchemaPath(schemaNode.schemaPath, "else");
    const nodes = collectStructuralPaths(schema.else, ownerPath);
    branches.push({
      id: `if:${ownerPath || "root"}:else`,
      schemaPath: elsePath,
      nodes: Object.freeze(nodes),
      exclusiveNodes: Object.freeze(nodes.filter((path) => !baseNodes.includes(path))),
      sharedNodes: Object.freeze(nodes.filter((path) => baseNodes.includes(path))),
      predicate: { type: "not", of: predicate.predicate },
      dependencies: predicate.dependencies,
    });
  }
  for (const branch of branches) {
    for (const path of branch.exclusiveNodes) {
      activations.push({ path, schemaPath: branch.schemaPath });
    }
  }
  plans.push({
    id: `if:${ownerPath || "root"}:${schemaNode.schemaPath}`,
    kind: "if",
    ownerPath,
    schemaPath: schemaNode.schemaPath,
    baseNodes: Object.freeze(baseNodes),
    branches: Object.freeze(branches),
    dependencies: Object.freeze([...predicate.dependencies]),
  });
}

function compileDependentPlan(
  schema: JsonSchemaObject,
  schemaNode: CanonicalSchemaNode,
  ownerPath: ModelPath,
  graph: CanonicalSchemaGraph,
  diagnostics: DiagnosticBag,
  plans: ActivationPlan[],
  activations: SchemaActivation[],
): void {
  const dependent = schema.dependentSchemas;
  if (dependent === undefined) {
    return;
  }
  const baseNodes = collectBasePaths(schema, ownerPath);
  const branches: ActivationBranch[] = [];
  const dependencies: ModelPath[] = [ownerPath];
  for (const name of Object.keys(dependent).sort()) {
    const child = dependent[name];
    if (child === undefined || !isJsonSchema(child)) {
      continue;
    }
    const schemaPath = childSchemaPath(childSchemaPath(schemaNode.schemaPath, "dependentSchemas"), name);
    const nodes = collectStructuralPaths(child, ownerPath);
    const predicate = {
      type: "present" as const,
      path: ownerPath,
      property: name,
    };
    void graph;
    void diagnostics;
    branches.push({
      id: `dependentSchemas:${ownerPath || "root"}:${name}`,
      schemaPath,
      nodes: Object.freeze(nodes),
      exclusiveNodes: Object.freeze(nodes.filter((path) => !baseNodes.includes(path))),
      sharedNodes: Object.freeze(nodes.filter((path) => baseNodes.includes(path))),
      predicate,
      dependencies: Object.freeze([ownerPath]),
      property: name,
    });
  }
  for (const branch of branches) {
    for (const path of branch.exclusiveNodes) {
      activations.push({ path, schemaPath: branch.schemaPath });
    }
  }
  plans.push({
    id: `dependentSchemas:${ownerPath || "root"}:${schemaNode.schemaPath}`,
    kind: "dependentSchemas",
    ownerPath,
    schemaPath: schemaNode.schemaPath,
    baseNodes: Object.freeze(baseNodes),
    branches: Object.freeze(branches),
    dependencies: Object.freeze(unique(dependencies)),
  });
}

function collectBasePaths(schema: JsonSchemaObject, ownerPath: ModelPath): ModelPath[] {
  const paths = collectFromProperties(schema.properties, ownerPath);
  if (schema.allOf !== undefined) {
    for (const item of schema.allOf) {
      if (isJsonSchemaObject(item)) {
        paths.push(...collectFromProperties(item.properties, ownerPath));
      }
    }
  }
  return unique([ownerPath, ...paths]);
}

function collectStructuralPaths(schema: JsonSchema, ownerPath: ModelPath): ModelPath[] {
  if (schema === true || schema === false) {
    return [ownerPath];
  }
  if (!isJsonSchemaObject(schema)) {
    return [ownerPath];
  }
  const paths: ModelPath[] = [ownerPath, ...collectFromProperties(schema.properties, ownerPath)];
  if (schema.allOf !== undefined) {
    for (const item of schema.allOf) {
      paths.push(...collectStructuralPaths(item, ownerPath));
    }
  }
  if (schema.anyOf !== undefined) {
    for (const item of schema.anyOf) {
      paths.push(...collectStructuralPaths(item, ownerPath));
    }
  }
  if (schema.oneOf !== undefined) {
    for (const item of schema.oneOf) {
      paths.push(...collectStructuralPaths(item, ownerPath));
    }
  }
  if (schema.then !== undefined) {
    paths.push(...collectStructuralPaths(schema.then, ownerPath));
  }
  if (schema.else !== undefined) {
    paths.push(...collectStructuralPaths(schema.else, ownerPath));
  }
  if (schema.dependentSchemas !== undefined) {
    for (const item of Object.values(schema.dependentSchemas)) {
      paths.push(...collectStructuralPaths(item, ownerPath));
    }
  }
  if (isJsonSchema(schema.items)) {
    const child = joinModelPath(ownerPath, { kind: "list" });
    paths.push(child, ...collectStructuralPaths(schema.items, child));
  }
  if (schema.prefixItems !== undefined) {
    schema.prefixItems.forEach((item, index) => {
      const child = joinModelPath(ownerPath, { kind: "tuple", index });
      paths.push(child, ...collectStructuralPaths(item, child));
    });
  }
  return unique(paths);
}

function collectFromProperties(
  properties: JsonSchemaObject["properties"],
  ownerPath: ModelPath,
): ModelPath[] {
  if (properties === undefined) {
    return [];
  }
  const paths: ModelPath[] = [];
  for (const [name, child] of Object.entries(properties)) {
    const childPath = joinModelPath(ownerPath, { kind: "property", name });
    paths.push(childPath, ...collectStructuralPaths(child, childPath));
  }
  return paths;
}

function pushPredicateError(
  result: PredicateCompileResult,
  diagnostics: DiagnosticBag,
  ownerPath: ModelPath,
): result is { ok: true; predicate: import("../../model/schema-dynamics/schema-dynamics.js").ActivationPredicate; dependencies: readonly ModelPath[] } {
  if (result.ok) {
    return true;
  }
  diagnostics.push(
    compilerError(COMPILER_DIAGNOSTIC_CODES.DYNAMICS_UNSUPPORTED, result.reason, {
      schemaPath: result.schemaPath,
      modelPath: ownerPath,
      metadata: { keyword: result.keyword, reason: result.reason },
    }),
  );
  return false;
}

function buildByPath(plans: readonly ActivationPlan[]): (readonly [ModelPath, readonly string[]])[] {
  const map = new Map<ModelPath, string[]>();
  for (const plan of plans) {
    for (const path of plan.dependencies) {
      const list = map.get(path) ?? [];
      if (!list.includes(plan.id)) {
        list.push(plan.id);
      }
      map.set(path, list);
    }
  }
  return [...map.entries()].map(([path, ids]) => [path, Object.freeze([...ids])] as const);
}

function findSchemaNode(graph: CanonicalSchemaGraph, schemaPath: SchemaPath): CanonicalSchemaNode | undefined {
  for (const node of graph.nodes.values()) {
    if (node.schemaPath === schemaPath) {
      return node;
    }
  }
  return undefined;
}

function uniqueSchemaRefs(node: DataNode): SchemaPath[] {
  return unique([node.schemaRef, ...node.schemaRefs]);
}

function isDiscriminatingPredicate(predicate: import("../../model/schema-dynamics/schema-dynamics.js").ActivationPredicate): boolean {
  return predicate.type !== "true" && predicate.type !== "false";
}

function unique<T extends string>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

void collectPredicateDependencies;
void ROOT_MODEL_PATH;
