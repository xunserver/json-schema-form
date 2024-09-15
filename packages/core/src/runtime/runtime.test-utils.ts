import { compileForm } from "../compiler/compile-form.js";
import { defineForm } from "../definition/define-form.js";
import type { UISchema } from "../definition/ui-schema.js";
import type { FormEnvironment } from "../extension/environment.js";
import type { CompiledFormModel } from "../model/compiled-form-model.js";
import { FormRuntimeError } from "./error.js";

export const PERSON_SCHEMA = {
  type: "object" as const,
  properties: {
    name: { type: "string" as const },
    age: { type: "number" as const },
    profile: {
      type: "object" as const,
      properties: {
        firstName: { type: "string" as const },
        lastName: { type: "string" as const },
      },
    },
    tags: { type: "array" as const, items: { type: "string" as const } },
  },
};

export function compilePersonModel(
  environment?: FormEnvironment,
  uiSchema?: UISchema,
): CompiledFormModel {
  return compileForm(
    defineForm({
      schema: PERSON_SCHEMA,
      ...(uiSchema === undefined ? {} : { uiSchema }),
    }),
    environment === undefined ? undefined : { environment },
  ).model;
}

export function compileDuplicateFieldModel(environment?: FormEnvironment): CompiledFormModel {
  return compilePersonModel(environment, {
    layout: {
      type: "layout",
      children: [
        { type: "group", children: [{ type: "field", path: "name" }] },
        { type: "group", children: [{ type: "field", path: "name" }] },
        { type: "remaining-fields" },
      ],
    },
  });
}

export function expectRuntimeError(run: () => unknown): FormRuntimeError {
  try {
    const result = run();
    throw new Error(`Expected FormRuntimeError but received ${String(result)}`);
  } catch (error) {
    if (error instanceof FormRuntimeError) {
      return error;
    }
    throw error;
  }
}
