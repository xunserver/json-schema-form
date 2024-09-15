// @ts-expect-error RuntimeNodeId is not exported from the public runtime barrel
import type { RuntimeNodeId } from "../src/runtime/index.js";

declare const leaked: RuntimeNodeId;
void leaked;
