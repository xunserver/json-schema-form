declare const runtimeNodeIdBrand: unique symbol;

export type RuntimeNodeId = string & {
  readonly [runtimeNodeIdBrand]: "RuntimeNodeId";
};
