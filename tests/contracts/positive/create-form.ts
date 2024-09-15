import { compileForm, createForm, createFormEngine, defineForm, FormRuntimeError } from "@form/core";
import type { ArrayInstance, FormInstance, ScopedFormInstance } from "@form/core";

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

export const form: FormInstance = createForm(compiled.model, { initialValues: { title: "Ada" } });
void form.serialize();
export const engine = createFormEngine();
void 0 as unknown as ArrayInstance;
void 0 as unknown as ScopedFormInstance;

export function isRuntimeError(error: unknown): error is FormRuntimeError {
  return error instanceof FormRuntimeError;
}
