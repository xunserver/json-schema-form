import { valueSelector, subscribeRuntime } from "@form/core";
import { getRenderScope } from "@form/core";
import type { InstanceBinding, RenderScope } from "@form/core";

export const leaked = valueSelector("name");
export const subscription = subscribeRuntime;
export const leakedScope = getRenderScope;
export type LeakedBinding = InstanceBinding | RenderScope;
