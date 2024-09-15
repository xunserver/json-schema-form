import type { DataModel, PropertyEdge, PropertyOrigin } from "../../model/data/data.js";
import { objectPropertyEdges } from "../../model/data/data.js";
import type { FieldRequirementPresentation } from "../../model/ui/ui.js";
import {
  formatSchemaPath,
  parseSchemaPath,
  type ModelPath,
  type SchemaPath,
} from "../../model/path/index.js";

interface IncomingPropertyEdge {
  readonly ownerPath: ModelPath;
  readonly edge: PropertyEdge;
}

export function incomingPropertyEdges(data: DataModel): ReadonlyMap<ModelPath, IncomingPropertyEdge> {
  const incoming = new Map<ModelPath, IncomingPropertyEdge>();
  for (const node of data.nodes.values()) {
    for (const edge of objectPropertyEdges(node)) {
      if (!incoming.has(edge.node.path)) {
        incoming.set(edge.node.path, { ownerPath: node.path, edge });
      }
    }
  }
  return incoming;
}

export function projectFieldRequirement(
  path: ModelPath,
  incoming: ReadonlyMap<ModelPath, IncomingPropertyEdge>,
): FieldRequirementPresentation | undefined {
  const source = incoming.get(path);
  if (source === undefined) {
    return undefined;
  }

  const activationSources =
    source.edge.required === "conditional" ? activationSourcesOf(source.edge) : undefined;

  return {
    status: source.edge.required,
    ownerPath: source.ownerPath,
    property: source.edge.name,
    schemaRefs: source.edge.schemaRefs,
    ...(activationSources === undefined || activationSources.length === 0 ? {} : { activationSources }),
  };
}

function activationSourcesOf(edge: PropertyEdge): readonly SchemaPath[] {
  const sources: SchemaPath[] = [];
  for (const ref of edge.schemaRefs) {
    const source = applicatorSource(ref, edge.origin);
    if (source !== undefined && !sources.includes(source)) {
      sources.push(source);
    }
  }
  return sources;
}

function applicatorSource(ref: SchemaPath, origin: PropertyOrigin): SchemaPath | undefined {
  const tokens = parseSchemaPath(ref);
  if (tokens === undefined) {
    return undefined;
  }
  const preferred = originMarkers(origin);
  const markers = uniqueMarkers([...preferred, "then", "else", "dependentSchemas", "oneOf", "anyOf"]);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || !markers.includes(token)) {
      continue;
    }
    if (token === "dependentSchemas" || token === "oneOf" || token === "anyOf") {
      const child = tokens[index + 1];
      if (child === undefined) {
        return formatSchemaPath(tokens.slice(0, index + 1));
      }
      return formatSchemaPath(tokens.slice(0, index + 2));
    }
    return formatSchemaPath(tokens.slice(0, index + 1));
  }
  return undefined;
}

function uniqueMarkers(markers: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const marker of markers) {
    if (!seen.has(marker)) {
      seen.add(marker);
      result.push(marker);
    }
  }
  return result;
}

function originMarkers(origin: PropertyOrigin): readonly string[] {
  switch (origin) {
    case "if-then":
      return ["then"];
    case "if-else":
      return ["else"];
    case "dependentSchemas":
      return ["dependentSchemas"];
    case "oneOf":
      return ["oneOf"];
    case "anyOf":
      return ["anyOf"];
    default:
      return [];
  }
}
