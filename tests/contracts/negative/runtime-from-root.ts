import { valueSelector, subscribeRuntime } from "@form/core";

export const leaked = valueSelector("name");
export const subscription = subscribeRuntime;
