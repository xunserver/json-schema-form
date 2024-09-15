import { compileForm, createForm, createFormEngine, defineForm, FormRuntimeError } from "@form/core";

export const compiled = compileForm(
  defineForm({
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
      },
    },
  }),
);

export const form = createForm(compiled.model, { initialValues: { title: "Ada" } });
export const engine = createFormEngine();

export function isRuntimeError(error: unknown): error is FormRuntimeError {
  return error instanceof FormRuntimeError;
}
