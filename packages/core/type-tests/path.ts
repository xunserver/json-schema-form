import type {
  InstancePath,
  InstancePathLike,
  ModelPath,
  ModelPathLike,
  SchemaPath,
} from "../src/model/path/index.js";

declare const schemaPath: SchemaPath;
declare const modelPath: ModelPath;
declare const instancePath: InstancePath;

const acceptedSchema: SchemaPath = schemaPath;
const acceptedModel: ModelPath = modelPath;
const acceptedInstance: InstancePath = instancePath;

const modelPathLikeFromBrand: ModelPathLike = modelPath;
const modelPathLikeFromString: ModelPathLike = "products[].name";
const instancePathLikeFromString: InstancePathLike = "products[2].name";

void acceptedSchema;
void acceptedModel;
void acceptedInstance;
void modelPathLikeFromBrand;
void modelPathLikeFromString;
void instancePathLikeFromString;

// @ts-expect-error ModelPath is not assignable to InstancePath
const modelAsInstance: InstancePath = modelPath;
void modelAsInstance;

// @ts-expect-error InstancePath is not assignable to ModelPath
const instanceAsModel: ModelPath = instancePath;
void instanceAsModel;

// @ts-expect-error SchemaPath is not assignable to ModelPath
const schemaAsModel: ModelPath = schemaPath;
void schemaAsModel;

// @ts-expect-error string is not a branded ModelPath
const stringAsModelPath: ModelPath = "products[].name";
void stringAsModelPath;
