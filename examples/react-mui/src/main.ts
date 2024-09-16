import { createElement } from "react";
import { FormRenderer } from "@form/react";
import { createDemoForm } from "./definition.js";
import { createDemoRendererEnvironment } from "./renderer.js";

export function createDemoElement() {
  const form = createDemoForm();
  const environment = createDemoRendererEnvironment();
  return createElement(FormRenderer, {
    form,
    environment,
    adapterId: "mui",
    submitHandler: () => undefined,
  });
}

export { createDemoForm, createDemoRendererEnvironment };
