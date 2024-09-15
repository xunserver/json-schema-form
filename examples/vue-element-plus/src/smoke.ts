import { createDemoForm, createDemoRendererEnvironment } from "./main.js";

const form = createDemoForm();
const environment = createDemoRendererEnvironment();
if (form.getValue("name") !== "Ada") {
  throw new Error("demo form did not instantiate");
}
if (environment.getAdapter("element-plus")?.widgets.has("company.currency") !== true) {
  throw new Error("custom currency widget is missing");
}
console.log("vue-element-plus smoke ok");
