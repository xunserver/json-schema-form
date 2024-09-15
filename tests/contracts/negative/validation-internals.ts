import type { ValidationEngine } from "@form/core";
import type { ErrorStore } from "@form/core";
import type { Ajv } from "ajv";
import { createAjvValidator } from "@form/core";

export type LeakedEngine = ValidationEngine;
export type LeakedStore = ErrorStore;
export const leakedAjv: Ajv | undefined = undefined;
export const leakedFactory = createAjvValidator;
