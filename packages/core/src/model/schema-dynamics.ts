import type { ModelPath, SchemaPath } from "../path/index.js";

export interface SchemaActivation {
  readonly path: ModelPath;
  readonly schemaPath: SchemaPath;
}

export interface SchemaDynamics {
  readonly activations: readonly SchemaActivation[];
}
