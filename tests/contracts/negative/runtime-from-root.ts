import { valueSelector, subscribeRuntime } from "@xunserver-jsf/core";
import { getRenderScope } from "@xunserver-jsf/core";
import type { InstanceBinding, RenderScope } from "@xunserver-jsf/core";

export const leaked = valueSelector("name");
export const subscription = subscribeRuntime;
export const leakedScope = getRenderScope;
export type LeakedBinding = InstanceBinding | RenderScope;
