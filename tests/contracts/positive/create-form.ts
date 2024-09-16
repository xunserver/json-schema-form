import { compileForm, createForm, createFormEngine, defineForm, FormRuntimeError } from "@xunserver-jsf/core";
import type { ArrayInstance, FormInstance, ScopedFormInstance } from "@xunserver-jsf/core";

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
form.setValue("title", "Ada");
form.focus(compiled.model.ui.viewTree.id);
form.blur(compiled.model.ui.viewTree.id);
form.setCollapsed(compiled.model.ui.viewTree.id, false);
form.setActiveTab(compiled.model.ui.viewTree.id, null);
void form.getField("title").getState().required;
void form.validate;
void form.applyErrors;
void form.submit;
export const engine = createFormEngine();
void 0 as unknown as ArrayInstance;
void 0 as unknown as ScopedFormInstance;

export function isRuntimeError(error: unknown): error is FormRuntimeError {
  return error instanceof FormRuntimeError;
}
