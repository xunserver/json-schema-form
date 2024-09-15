import type { RuntimeNodeId as InternalRuntimeNodeId } from "../src/runtime/runtime-node-id.js";

declare const internalId: InternalRuntimeNodeId;
void internalId;

// @ts-expect-error RuntimeNodeId is not exported from the public root barrel
import type { RuntimeNodeId } from "../src/index.js";

declare const leaked: RuntimeNodeId;
void leaked;
