import { createDemoForm, createDemoRendererEnvironment } from "./main.js";

const form = createDemoForm();
const environment = createDemoRendererEnvironment();
if (form.getValue("name") !== "Ada") {
  throw new Error("demo form did not instantiate");
}
if (environment.getAdapter("mui")?.widgets.has("company.currency") !== true) {
  throw new Error("custom currency widget is missing");
}
const submitted = await form.submit(async (payload) => payload);
if (submitted.submitted === true && submitted.valid === false) {
  throw new Error("unexpected invalid submitted payload");
}
console.log("react-mui smoke ok");
