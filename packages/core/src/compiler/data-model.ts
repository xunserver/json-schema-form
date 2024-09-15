import type {
  ArrayDataNode,
  DataModel,
  DataNode,
  ObjectDataNode,
  PropertyEdge,
  RecursiveDataRef,
  ScalarDataNode,
  UnionDataNode,
} from "../model/data.js";
import { createReadonlyKeyedCollection } from "../model/readonly-collection.js";
import {
  ROOT_MODEL_PATH,
  joinModelPath,
  type ModelPath,
  type SchemaPath,
} from "../path/index.js";
import { dataNodeId } from "./ids.js";
import { deepFreeze } from "./immutable.js";
import type {
  ArrayShape,
  DataShape,
  ObjectPropertyShape,
  ObjectShape,
  ScalarShape,
  UnionShape,
} from "./shape/types.js";

interface AncestryFrame {
  readonly graphId: string;
  readonly dataId: ReturnType<typeof dataNodeId>;
}

export function compileDataModel(rootShape: DataShape): DataModel {
  const nodes = new Map<ModelPath, DataNode>();
  const root = compileShape(rootShape, ROOT_MODEL_PATH, [], nodes);
  nodes.set(ROOT_MODEL_PATH, root);
  const collection = createReadonlyKeyedCollection([...nodes.entries()]);
  return deepFreeze({
    root,
    nodes: collection,
  });
}

function compileShape(
  shape: DataShape,
  path: ModelPath,
  ancestry: readonly AncestryFrame[],
  nodes: Map<ModelPath, DataNode>,
  role = "node",
): DataNode {
  if (shape.kind === "recursive-ref") {
    const recursive = compileRecursive(shape.targetId, path, ancestry, shape.schemaRefs, role);
    if (!nodes.has(path) || role === "node") {
      nodes.set(path, recursive);
    }
    return recursive;
  }

  const id = dataNodeId(path, role);
  const graphIds = [...new Set([shape.graphId].filter((value): value is string => value !== undefined))];
  const nextAncestry =
    graphIds.length === 0
      ? ancestry
      : [...ancestry, ...graphIds.map((graphId) => ({ graphId, dataId: id }))];

  let node: DataNode;
  switch (shape.kind) {
    case "object":
      node = compileObject(shape, path, id, nextAncestry, nodes);
      break;
    case "array":
      node = compileArray(shape, path, id, nextAncestry, nodes);
      break;
    case "scalar":
      node = compileScalar(shape, path, id);
      break;
    case "union":
      node = compileUnion(shape, path, id, nextAncestry, nodes);
      break;
    case "never":
      node = {
        kind: "never",
        id,
        path,
        schemaRef: primaryRef(shape.schemaRefs),
        schemaRefs: shape.schemaRefs,
      };
      break;
    default:
      node = {
        kind: "any",
        id,
        path,
        schemaRef: primaryRef(shape.schemaRefs),
        schemaRefs: shape.schemaRefs,
      };
      break;
  }

  const existing = nodes.get(path);
  if (existing === undefined || role === "node") {
    nodes.set(path, node);
  }
  return node;
}

function compileObject(
  shape: ObjectShape,
  path: ModelPath,
  id: ReturnType<typeof dataNodeId>,
  ancestry: readonly AncestryFrame[],
  nodes: Map<ModelPath, DataNode>,
): ObjectDataNode {
  const properties: PropertyEdge[] = shape.properties.map((property) => {
    const childPath = joinModelPath(path, { kind: "property", name: property.name });
    const child = compileShape(property.shape, childPath, ancestry, nodes);
    return {
      name: property.name,
      required: property.required,
      node: child,
      origin: property.origin,
      schemaRefs: property.schemaRefs,
    };
  });

  return {
    kind: "object",
    id,
    path,
    schemaRef: primaryRef(shape.schemaRefs),
    schemaRefs: shape.schemaRefs,
    properties,
  };
}

function compileArray(
  shape: ArrayShape,
  path: ModelPath,
  id: ReturnType<typeof dataNodeId>,
  ancestry: readonly AncestryFrame[],
  nodes: Map<ModelPath, DataNode>,
): ArrayDataNode {
  const items =
    shape.items === undefined
      ? undefined
      : compileShape(shape.items, joinModelPath(path, { kind: "list" }), ancestry, nodes);
  const prefixItems =
    shape.prefixItems === undefined
      ? undefined
      : shape.prefixItems.map((slot, index) =>
          compileShape(slot, joinModelPath(path, { kind: "tuple", index }), ancestry, nodes),
        );

  return {
    kind: "array",
    id,
    path,
    schemaRef: primaryRef(shape.schemaRefs),
    schemaRefs: shape.schemaRefs,
    form: shape.form,
    ...(items === undefined ? {} : { items }),
    ...(prefixItems === undefined ? {} : { prefixItems }),
  };
}

function compileScalar(shape: ScalarShape, path: ModelPath, id: ReturnType<typeof dataNodeId>): ScalarDataNode {
  return {
    kind: "scalar",
    id,
    path,
    schemaRef: primaryRef(shape.schemaRefs),
    schemaRefs: shape.schemaRefs,
    valueType: shape.valueType,
    nullable: shape.nullable,
    ...(shape.enum === undefined ? {} : { enum: shape.enum }),
    ...(shape.const === undefined ? {} : { const: shape.const }),
    ...(shape.format === undefined ? {} : { format: shape.format }),
  };
}

function compileUnion(
  shape: UnionShape,
  path: ModelPath,
  id: ReturnType<typeof dataNodeId>,
  ancestry: readonly AncestryFrame[],
  nodes: Map<ModelPath, DataNode>,
): UnionDataNode {
  const objectVariants = shape.variants.filter((variant): variant is ObjectShape => variant.kind === "object");
  if (objectVariants.length > 0) {
    mergeUnionProperties(path, objectVariants, ancestry, nodes);
  }

  const variants = shape.variants.map((variant, index) => {
    if (variant.kind === "object") {
      return {
        kind: "object" as const,
        id: dataNodeId(path, `variant:${index}`),
        path,
        schemaRef: primaryRef(variant.schemaRefs),
        schemaRefs: variant.schemaRefs,
        properties: variant.properties.map((property) => {
          const childPath = joinModelPath(path, { kind: "property", name: property.name });
          return {
            name: property.name,
            required: property.required,
            origin: property.origin,
            schemaRefs: property.schemaRefs,
            node: nodes.get(childPath) ?? compileShape(property.shape, childPath, ancestry, nodes),
          };
        }),
      };
    }
    return compileShape(variant, path, ancestry, nodes, `variant:${index}`);
  });

  return {
    kind: "union",
    id,
    path,
    schemaRef: primaryRef(shape.schemaRefs),
    schemaRefs: shape.schemaRefs,
    variants,
    provenance: shape.provenance,
  };
}

function mergeUnionProperties(
  path: ModelPath,
  objectVariants: readonly ObjectShape[],
  ancestry: readonly AncestryFrame[],
  nodes: Map<ModelPath, DataNode>,
): void {
  const names: string[] = [];
  const grouped = new Map<string, ObjectPropertyShape[]>();
  for (const variant of objectVariants) {
    for (const property of variant.properties) {
      const list = grouped.get(property.name);
      if (list === undefined) {
        grouped.set(property.name, [property]);
        names.push(property.name);
      } else {
        list.push(property);
      }
    }
  }

  for (const name of names) {
    const group = grouped.get(name)!;
    const childPath = joinModelPath(path, { kind: "property", name });
    if (group.length === 1) {
      if (!nodes.has(childPath)) {
        compileShape(group[0]!.shape, childPath, ancestry, nodes);
      }
      continue;
    }
    const unionShape: UnionShape = {
      kind: "union",
      provenance: "conflict",
      variants: group.map((property) => property.shape),
      schemaRefs: group.flatMap((property) => property.schemaRefs),
    };
    compileShape(unionShape, childPath, ancestry, nodes);
  }
}

function compileRecursive(
  targetGraphId: string,
  path: ModelPath,
  ancestry: readonly AncestryFrame[],
  schemaRefs: readonly SchemaPath[],
  role: string,
): RecursiveDataRef {
  const target = [...ancestry].reverse().find((frame) => frame.graphId === targetGraphId);
  const targetId = target?.dataId ?? dataNodeId(path, "unresolved-recursive");
  return {
    kind: "recursive-ref",
    id: dataNodeId(path, role),
    path,
    schemaRef: primaryRef(schemaRefs),
    schemaRefs,
    targetId,
  };
}

function primaryRef(refs: readonly SchemaPath[]): SchemaPath {
  return refs[0] ?? ("#" as SchemaPath);
}
