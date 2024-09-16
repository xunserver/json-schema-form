import { compileForm, createForm, defineForm } from "/packages/core/dist/index.js";

self.addEventListener("message", (event) => {
  if (event.data !== "run") {
    return;
  }
  const definition = defineForm({
    schema: { type: "object", properties: { name: { type: "string" } } },
  });
  const { model } = compileForm(definition);
  const form = createForm(model, { initialValues: { name: "Ada" } });
  form.setValue("name", "Worker");
  self.postMessage({ name: form.getValue("name"), hasDocument: typeof document !== "undefined" });
});
