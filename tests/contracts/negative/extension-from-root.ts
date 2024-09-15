import { createFormEnvironment, definePlugin } from "@form/core";

export const leaked = definePlugin({ id: "leaked" });
export const environment = createFormEnvironment();
