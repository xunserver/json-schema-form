declare const dataNodeIdBrand: unique symbol;
declare const viewNodeIdBrand: unique symbol;
declare const arrayItemIdBrand: unique symbol;

export type DataNodeId = string & {
  readonly [dataNodeIdBrand]: "DataNodeId";
};

export type ViewNodeId = string & {
  readonly [viewNodeIdBrand]: "ViewNodeId";
};

export type ArrayItemId = string & {
  readonly [arrayItemIdBrand]: "ArrayItemId";
};
