import type { DataNodeId } from "../identity/index.js";
import type { ModelPath, SchemaPath } from "../path/index.js";
import type { ReadonlyKeyedCollection } from "../readonly-collection.js";

export type DataNodeKind =
  | "object"
  | "array"
  | "scalar"
  | "union"
  | "any"
  | "never"
  | "recursive-ref";

export type ScalarValueType = "string" | "number" | "integer" | "boolean" | "null";

export type PropertyRequiredStatus = "required" | "optional" | "conditional";

export type PropertyOrigin =
  | "properties"
  | "allOf"
  | "oneOf"
  | "anyOf"
  | "if-then"
  | "if-else"
  | "dependentSchemas";

export interface DataNodeBase {
  readonly id: DataNodeId;
  readonly path: ModelPath;
  readonly schemaRef: SchemaPath;
  readonly schemaRefs: readonly SchemaPath[];
  readonly kind: DataNodeKind;
}

export interface PropertyEdge {
  readonly name: string;
  readonly required: PropertyRequiredStatus;
  readonly node: DataNode;
  readonly origin: PropertyOrigin;
  readonly schemaRefs: readonly SchemaPath[];
}

export interface ObjectDataNode extends DataNodeBase {
  readonly kind: "object";
  readonly properties: readonly PropertyEdge[];
}

export interface ArrayDataNode extends DataNodeBase {
  readonly kind: "array";
  readonly form: "list" | "tuple";
  readonly items?: DataNode;
  readonly prefixItems?: readonly DataNode[];
}

export interface ScalarDataNode extends DataNodeBase {
  readonly kind: "scalar";
  readonly valueType: ScalarValueType;
  readonly nullable: boolean;
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly format?: string;
}

export interface UnionDataNode extends DataNodeBase {
  readonly kind: "union";
  readonly variants: readonly DataNode[];
  readonly provenance: "oneOf" | "anyOf" | "type" | "conflict" | "conditional";
}

export interface AnyDataNode extends DataNodeBase {
  readonly kind: "any";
}

export interface NeverDataNode extends DataNodeBase {
  readonly kind: "never";
}

export interface RecursiveDataRef extends DataNodeBase {
  readonly kind: "recursive-ref";
  readonly targetId: DataNodeId;
}

export type DataNode =
  | ObjectDataNode
  | ArrayDataNode
  | ScalarDataNode
  | UnionDataNode
  | AnyDataNode
  | NeverDataNode
  | RecursiveDataRef;

export interface DataModel {
  readonly root: DataNode;
  readonly nodes: ReadonlyKeyedCollection<ModelPath, DataNode>;
}

export function objectPropertyEdges(node: DataNode): readonly PropertyEdge[] {
  if (node.kind === "object") {
    return node.properties;
  }
  if (node.kind !== "union") {
    return [];
  }
  const seen = new Set<string>();
  const edges: PropertyEdge[] = [];
  for (const variant of node.variants) {
    for (const edge of objectPropertyEdges(variant)) {
      if (seen.has(edge.name)) {
        continue;
      }
      seen.add(edge.name);
      edges.push(edge);
    }
  }
  return edges;
}
