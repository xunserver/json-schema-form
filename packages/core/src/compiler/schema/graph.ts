import type { JsonSchema } from "../../definition/json-schema.js";
import type { SchemaPath } from "../../model/path/index.js";

export interface SchemaRefEdge {
  readonly href: string;
  readonly targetId?: string;
  readonly cycle: boolean;
  readonly external: boolean;
  readonly unresolved: boolean;
}

export interface CanonicalSchemaNode {
  readonly id: string;
  readonly schemaPath: SchemaPath;
  readonly resourceUri: string;
  readonly pointer: string;
  readonly booleanValue?: boolean;
  readonly schema: JsonSchema;
  readonly ref?: SchemaRefEdge;
  readonly dynamicRef?: string;
  readonly anchors: readonly string[];
  readonly childIds: Readonly<Record<string, string | readonly string[]>>;
  readonly extensionKeys: readonly string[];
}

export interface CanonicalSchemaGraph {
  readonly rootId: string;
  readonly dialect: "draft-2020-12";
  readonly nodes: ReadonlyMap<string, CanonicalSchemaNode>;
}
