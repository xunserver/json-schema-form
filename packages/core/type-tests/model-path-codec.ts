import type { InstancePath, ModelPath } from "../src/model/path/index.js";
import { parseModelPath, toModelPath } from "../src/model/path/model-path.js";

const staticPath = toModelPath("products[].name");
const parsed = parseModelPath("coords[#0]");
const rejectedInstance = parseModelPath("products[0]");

void staticPath;
void parsed;
void rejectedInstance;

declare const modelPath: ModelPath;
declare const instancePath: InstancePath;

// @ts-expect-error parsed ModelPath is not an InstancePath
const asInstance: InstancePath = modelPath;
void asInstance;

// @ts-expect-error InstancePath is not a ModelPath
const asModel: ModelPath = instancePath;
void asModel;
