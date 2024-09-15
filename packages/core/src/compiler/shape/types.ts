import type { JsonSchemaType } from "../../definition/json-schema.js";
import type { PropertyOrigin, PropertyRequiredStatus, ScalarValueType } from "../../model/data.js";
import type { SchemaPath } from "../../path/index.js";

export type DataShapeKind =
  | "scalar"
  | "object"
  | "array"
  | "union"
  | "any"
  | "never"
  | "recursive-ref";

export interface ShapeBase {
  readonly kind: DataShapeKind;
  readonly schemaRefs: readonly SchemaPath[];
  readonly inferred?: boolean;
  readonly graphId?: string;
}

export interface ScalarShape extends ShapeBase {
  readonly kind: "scalar";
  readonly valueType: ScalarValueType;
  readonly nullable: boolean;
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly format?: string;
}

export interface ObjectPropertyShape {
  readonly name: string;
  readonly required: PropertyRequiredStatus;
  readonly origin: PropertyOrigin;
  readonly shape: DataShape;
  readonly schemaRefs: readonly SchemaPath[];
}

export interface ObjectShape extends ShapeBase {
  readonly kind: "object";
  readonly properties: readonly ObjectPropertyShape[];
}

export interface ArrayShape extends ShapeBase {
  readonly kind: "array";
  readonly form: "list" | "tuple";
  readonly items?: DataShape;
  readonly prefixItems?: readonly DataShape[];
}

export interface UnionShape extends ShapeBase {
  readonly kind: "union";
  readonly variants: readonly DataShape[];
  readonly provenance: "oneOf" | "anyOf" | "type" | "conflict" | "conditional";
}

export interface AnyShape extends ShapeBase {
  readonly kind: "any";
}

export interface NeverShape extends ShapeBase {
  readonly kind: "never";
}

export interface RecursiveRefShape extends ShapeBase {
  readonly kind: "recursive-ref";
  readonly targetId: string;
}

export type DataShape =
  | ScalarShape
  | ObjectShape
  | ArrayShape
  | UnionShape
  | AnyShape
  | NeverShape
  | RecursiveRefShape;

export function anyShape(schemaRefs: readonly SchemaPath[], inferred = false): AnyShape {
  return { kind: "any", schemaRefs, ...(inferred ? { inferred: true } : {}) };
}

export function neverShape(schemaRefs: readonly SchemaPath[]): NeverShape {
  return { kind: "never", schemaRefs };
}

export function refsOf(shape: DataShape): readonly SchemaPath[] {
  return shape.schemaRefs;
}

export function isScalarJsonType(type: JsonSchemaType): type is ScalarValueType {
  return type === "string" || type === "number" || type === "integer" || type === "boolean" || type === "null";
}
