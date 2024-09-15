import type { FormConfig } from "../../definition/form-config.js";
import type { JsonSchema, JsonSchemaObject } from "../../definition/json-schema.js";
import type { JsonValue } from "../../definition/json-value.js";
import type { RuleDefinition } from "../../definition/rule-definition.js";
import type { FieldUI, UISchema } from "../../definition/ui-schema.js";
import type {
  SchemaExtensionDefinition,
  SchemaExtensionSplitResult,
} from "../../extension/contributions.js";
import type { FormEnvironment } from "../../extension/environment.js";
import type { DataModel, DataNode } from "../../model/data/data.js";
import { SCHEMA_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import {
  type ModelPath,
  type SchemaPath,
  childSchemaPath,
} from "../../model/path/index.js";
import { DiagnosticBag, schemaError, schemaInfo, schemaWarning } from "../diagnostics.js";
import { CloneShapeError, clonePlain, deepFreeze, isPlainObject, isThenable } from "../immutable.js";
import type { CanonicalSchemaGraph, CanonicalSchemaNode } from "./graph.js";
import { isExtensionKeyword } from "../../schema/keywords.js";

export interface DeclaredExtensionOccurrence {
  readonly keyword: `x-${string}`;
  readonly schemaPath: SchemaPath;
  readonly value: JsonValue;
  readonly extension: SchemaExtensionDefinition;
  readonly pluginId: string;
  readonly key: string;
}

export interface SchemaExtensionIndexEntry {
  readonly key: string;
  readonly pluginId: string;
  readonly extension: SchemaExtensionDefinition;
}

export interface EffectiveAuthoring {
  readonly graph: CanonicalSchemaGraph;
  readonly schema: JsonSchema;
  readonly uiSchema: UISchema | undefined;
  readonly rules: readonly RuleDefinition[] | undefined;
  readonly config: FormConfig | undefined;
}

export function buildSchemaExtensionIndex(
  environment: FormEnvironment,
): ReadonlyMap<string, SchemaExtensionIndexEntry> {
  const index = new Map<string, SchemaExtensionIndexEntry>();
  for (const entry of environment.schemaExtensions.inspectAll()) {
    index.set(entry.value.keyword, {
      key: entry.key,
      pluginId: entry.pluginId,
      extension: entry.value,
    });
  }
  return index;
}

export function applyDeclaredExtensions(input: {
  readonly graph: CanonicalSchemaGraph;
  readonly occurrences: readonly DeclaredExtensionOccurrence[];
  readonly data: DataModel;
  readonly uiSchema: UISchema | undefined;
  readonly rules: readonly RuleDefinition[] | undefined;
  readonly config: FormConfig | undefined;
  readonly diagnostics: DiagnosticBag;
}): EffectiveAuthoring {
  const mapping = indexSchemaPaths(input.data);
  const fields = new Map<ModelPath, FieldUI>();
  for (const [path, field] of Object.entries(input.uiSchema?.fields ?? {})) {
    fields.set(path as ModelPath, field);
  }
  const rules: RuleDefinition[] = input.rules === undefined ? [] : [...input.rules];
  let config: FormConfig | undefined =
    input.config === undefined ? undefined : { ...input.config };
  const declaredKeywords = new Set(input.occurrences.map((item) => item.keyword));

  for (const occurrence of input.occurrences) {
    const modelPaths = mapping.get(occurrence.schemaPath) ?? [];
    if (modelPaths.length === 0) {
      input.diagnostics.push(
        schemaWarning(
          SCHEMA_DIAGNOSTIC_CODES.EXTENSION_UNMAPPED,
          `Declared extension keyword ${occurrence.keyword} cannot be mapped to a ModelPath`,
          childSchemaPath(occurrence.schemaPath, occurrence.keyword),
          {
            keyword: occurrence.keyword,
            extension: occurrence.extension.name,
            pluginId: occurrence.pluginId,
          },
          occurrence.pluginId,
        ),
      );
      continue;
    }

    for (const modelPath of modelPaths) {
      const fragment = invokeSplit(occurrence, modelPath, input.diagnostics);
      if (fragment === undefined) {
        continue;
      }
      if (fragment.fieldUI !== undefined) {
        const merged = mergeFieldUI(
          fields.get(modelPath),
          fragment.fieldUI,
          occurrence,
          modelPath,
          input.diagnostics,
        );
        fields.set(modelPath, merged);
      }
      if (fragment.rules !== undefined) {
        rules.push(...fragment.rules);
      }
      if (fragment.config !== undefined) {
        config = mergeConfig(config, fragment.config, occurrence, modelPath, input.diagnostics);
      }
      input.diagnostics.push(
        schemaInfo(
          SCHEMA_DIAGNOSTIC_CODES.EXTENSION_APPLIED,
          `Applied schema extension "${occurrence.extension.name}"`,
          childSchemaPath(occurrence.schemaPath, occurrence.keyword),
          {
            keyword: occurrence.keyword,
            extension: occurrence.extension.name,
            pluginId: occurrence.pluginId,
            modelPath,
          },
          occurrence.pluginId,
        ),
      );
    }
  }

  const graph = stripDeclaredKeywords(input.graph, declaredKeywords);
  const schema = graph.nodes.get(graph.rootId)?.schema ?? input.graph.nodes.get(input.graph.rootId)!.schema;
  const nextFields = Object.fromEntries([...fields.entries()]);
  const uiSchema: UISchema | undefined =
    input.uiSchema === undefined && fields.size === 0
      ? undefined
      : {
          ...(input.uiSchema ?? {}),
          ...(fields.size === 0 ? {} : { fields: nextFields }),
        };

  return {
    graph,
    schema,
    uiSchema,
    rules: rules.length === 0 && input.rules === undefined ? undefined : rules,
    config,
  };
}

function invokeSplit(
  occurrence: DeclaredExtensionOccurrence,
  modelPath: ModelPath,
  diagnostics: DiagnosticBag,
): SchemaExtensionSplitResult | undefined {
  const frozenInput = deepFreeze({
    value: occurrence.value,
    schemaPath: occurrence.schemaPath,
    modelPath,
  });
  let raw: unknown;
  try {
    raw = occurrence.extension.split(frozenInput);
  } catch {
    pushSplitFailure(diagnostics, occurrence, modelPath, "threw");
    return undefined;
  }
  if (isThenable(raw)) {
    pushSplitFailure(diagnostics, occurrence, modelPath, "thenable");
    return undefined;
  }
  if (raw === undefined) {
    return {};
  }
  if (!isPlainObject(raw)) {
    pushSplitFailure(diagnostics, occurrence, modelPath, "invalid-fragment");
    return undefined;
  }
  try {
    const cloned = clonePlain(raw) as SchemaExtensionSplitResult;
    if (cloned.fieldUI !== undefined && !isPlainObject(cloned.fieldUI)) {
      pushSplitFailure(diagnostics, occurrence, modelPath, "invalid-fragment");
      return undefined;
    }
    if (cloned.rules !== undefined && !Array.isArray(cloned.rules)) {
      pushSplitFailure(diagnostics, occurrence, modelPath, "invalid-fragment");
      return undefined;
    }
    if (cloned.config !== undefined && !isPlainObject(cloned.config)) {
      pushSplitFailure(diagnostics, occurrence, modelPath, "invalid-fragment");
      return undefined;
    }
    return cloned;
  } catch (error) {
    const reason = error instanceof CloneShapeError ? error.reason : "non-json";
    pushSplitFailure(diagnostics, occurrence, modelPath, "invalid-fragment", reason);
    return undefined;
  }
}

function mergeFieldUI(
  explicit: FieldUI | undefined,
  fragment: FieldUI,
  occurrence: DeclaredExtensionOccurrence,
  modelPath: ModelPath,
  diagnostics: DiagnosticBag,
): FieldUI {
  if (explicit === undefined) {
    return fragment;
  }
  const merged: Record<string, unknown> = { ...fragment, ...explicit };
  for (const key of Object.keys(fragment)) {
    if (explicitHasKey(explicit, key)) {
      diagnostics.push({
        code: SCHEMA_DIAGNOSTIC_CODES.EXTENSION_OVERLAP,
        severity: "warning",
        message: `Explicit authoring overrides schema extension "${occurrence.extension.name}" key "${key}"`,
        source: "schema",
        schemaPath: childSchemaPath(occurrence.schemaPath, occurrence.keyword),
        modelPath,
        pluginId: occurrence.pluginId,
        metadata: {
          keyword: occurrence.keyword,
          extension: occurrence.extension.name,
          pluginId: occurrence.pluginId,
          modelPath,
          key,
        },
      });
      merged[key] = (explicit as Record<string, unknown>)[key];
    }
  }
  return merged as FieldUI;
}

function mergeConfig(
  explicit: FormConfig | undefined,
  fragment: Partial<FormConfig>,
  occurrence: DeclaredExtensionOccurrence,
  modelPath: ModelPath,
  diagnostics: DiagnosticBag,
): FormConfig {
  if (explicit === undefined) {
    return fragment as FormConfig;
  }
  const merged: Record<string, unknown> = { ...fragment, ...explicit };
  for (const key of Object.keys(fragment)) {
    if (explicitHasKey(explicit, key)) {
      diagnostics.push({
        code: SCHEMA_DIAGNOSTIC_CODES.EXTENSION_OVERLAP,
        severity: "warning",
        message: `Explicit Form Config overrides schema extension "${occurrence.extension.name}" key "${key}"`,
        source: "schema",
        schemaPath: childSchemaPath(occurrence.schemaPath, occurrence.keyword),
        modelPath,
        pluginId: occurrence.pluginId,
        metadata: {
          keyword: occurrence.keyword,
          extension: occurrence.extension.name,
          pluginId: occurrence.pluginId,
          modelPath,
          key,
        },
      });
      merged[key] = (explicit as Record<string, unknown>)[key];
    }
  }
  return merged as FormConfig;
}

function explicitHasKey(explicit: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(explicit, key) && (explicit as Record<string, unknown>)[key] !== undefined;
}

function indexSchemaPaths(data: DataModel): Map<SchemaPath, ModelPath[]> {
  const mapping = new Map<SchemaPath, ModelPath[]>();
  for (const node of data.nodes.values()) {
    collectNodeRefs(node, mapping);
  }
  for (const paths of mapping.values()) {
    paths.sort();
  }
  return mapping;
}

function collectNodeRefs(node: DataNode, mapping: Map<SchemaPath, ModelPath[]>): void {
  for (const ref of node.schemaRefs) {
    addMapping(mapping, ref, node.path);
  }
}

function addMapping(mapping: Map<SchemaPath, ModelPath[]>, ref: SchemaPath, path: ModelPath): void {
  const list = mapping.get(ref);
  if (list === undefined) {
    mapping.set(ref, [path]);
    return;
  }
  if (!list.includes(path)) {
    list.push(path);
  }
}

function stripDeclaredKeywords(
  graph: CanonicalSchemaGraph,
  keywords: ReadonlySet<string>,
): CanonicalSchemaGraph {
  if (keywords.size === 0) {
    return graph;
  }
  const nodes = new Map<string, CanonicalSchemaNode>();
  for (const [id, node] of graph.nodes) {
    if (typeof node.schema !== "object" || node.schema === null) {
      nodes.set(id, {
        ...node,
        extensionKeys: node.extensionKeys.filter((key) => !keywords.has(key)),
      });
      continue;
    }
    const current = node.schema as JsonSchemaObject & Record<string, unknown>;
    const declared = Object.keys(current).filter((key) => keywords.has(key));
    if (declared.length === 0) {
      nodes.set(id, {
        ...node,
        extensionKeys: node.extensionKeys.filter((key) => !keywords.has(key)),
      });
      continue;
    }
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(current)) {
      if (!keywords.has(key)) {
        next[key] = current[key];
      }
    }
    nodes.set(id, {
      ...node,
      schema: next as JsonSchema,
      extensionKeys: node.extensionKeys.filter((key) => !isExtensionKeyword(key) || !keywords.has(key)),
    });
  }
  return { ...graph, nodes };
}

function pushSplitFailure(
  diagnostics: DiagnosticBag,
  occurrence: DeclaredExtensionOccurrence,
  modelPath: ModelPath,
  reason: string,
  detail?: string,
): void {
  diagnostics.push(
    schemaError(
      SCHEMA_DIAGNOSTIC_CODES.EXTENSION_SPLIT_FAILED,
      `Schema extension "${occurrence.extension.name}" failed`,
      childSchemaPath(occurrence.schemaPath, occurrence.keyword),
      {
        keyword: occurrence.keyword,
        extension: occurrence.extension.name,
        pluginId: occurrence.pluginId,
        modelPath,
        reason,
        ...(detail === undefined ? {} : { detail }),
      },
      occurrence.pluginId,
    ),
  );
}
