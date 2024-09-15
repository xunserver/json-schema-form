// @ts-expect-error RuntimeNodeId is not exported from the public extension barrel
import type { RuntimeNodeId } from "../src/extension/index.js";

declare const leaked: RuntimeNodeId;
void leaked;
