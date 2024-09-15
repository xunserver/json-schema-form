import type { ArrayItemId, DataNodeId, ViewNodeId } from "../src/identity/index.js";
import type { InstancePath } from "../src/path/index.js";

declare const dataNodeId: DataNodeId;
declare const viewNodeId: ViewNodeId;
declare const arrayItemId: ArrayItemId;
declare const currentPath: InstancePath;

const acceptedData: DataNodeId = dataNodeId;
const acceptedView: ViewNodeId = viewNodeId;
const acceptedArrayItem: ArrayItemId = arrayItemId;
const distinctAddress: InstancePath = currentPath;

void acceptedData;
void acceptedView;
void acceptedArrayItem;
void distinctAddress;

// @ts-expect-error ViewNodeId is not assignable to DataNodeId
const viewAsData: DataNodeId = viewNodeId;
void viewAsData;

// @ts-expect-error DataNodeId is not assignable to ViewNodeId
const dataAsView: ViewNodeId = dataNodeId;
void dataAsView;

// @ts-expect-error ArrayItemId is not an InstancePath
const arrayItemAsPath: InstancePath = arrayItemId;
void arrayItemAsPath;

// @ts-expect-error InstancePath is not an ArrayItemId
const pathAsArrayItem: ArrayItemId = currentPath;
void pathAsArrayItem;
