import { compileForm, createForm, defineForm } from "@form/core";

const definition = defineForm({
  schema: { type: "object", properties: { name: { type: "string" } } },
});
const { model } = compileForm(definition);
const form = createForm(model, { initialValues: { name: "Ada" } });
form.setValue("name", "Grace");
document.getElementById("out")?.replaceChildren(form.getValue("name") ?? "");
