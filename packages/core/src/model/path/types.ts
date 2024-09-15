declare const schemaPathBrand: unique symbol;
declare const modelPathBrand: unique symbol;
declare const instancePathBrand: unique symbol;

export type SchemaPath = string & {
  readonly [schemaPathBrand]: "SchemaPath";
};

export type ModelPath = string & {
  readonly [modelPathBrand]: "ModelPath";
};

export type InstancePath = string & {
  readonly [instancePathBrand]: "InstancePath";
};

export type SchemaPathLike = SchemaPath | string;
export type ModelPathLike = ModelPath | string;
export type InstancePathLike = InstancePath | string;
