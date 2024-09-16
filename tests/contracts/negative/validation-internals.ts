import type { ValidationEngine } from "@xunserver-jsf/core";
import type { ErrorStore } from "@xunserver-jsf/core";
import type { Ajv } from "ajv";
import { createAjvValidator } from "@xunserver-jsf/core";

export type LeakedEngine = ValidationEngine;
export type LeakedStore = ErrorStore;
export const leakedAjv: Ajv | undefined = undefined;
export const leakedFactory = createAjvValidator;
