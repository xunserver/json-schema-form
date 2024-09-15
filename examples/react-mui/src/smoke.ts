import { createDemoForm, createDemoRendererEnvironment } from "./main.js";

const form = createDemoForm();
const environment = createDemoRendererEnvironment();
if (form.getValue("name") !== "Ada") {
  throw new Error("demo form did not instantiate");
}
if (environment.getAdapter("mui")?.widgets.has("company.currency") !== true) {
  throw new Error("custom currency widget is missing");
}
if (environment.getAdapter("mui")?.widgets.has("text") !== true) {
  throw new Error("default text widget is missing");
}
console.log("react-mui smoke ok");
