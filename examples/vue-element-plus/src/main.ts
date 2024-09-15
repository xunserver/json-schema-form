import { FormRenderer } from "@form/vue";
import { createDemoForm } from "./definition.js";
import { createDemoRendererEnvironment } from "./renderer.js";
import { createApp, h } from "vue";

export function createDemoApp() {
  const form = createDemoForm();
  const environment = createDemoRendererEnvironment();
  return createApp({
    setup() {
      return () =>
        h(FormRenderer, {
          form,
          environment,
          adapterId: "element-plus",
          submitHandler: () => undefined,
        });
    },
  });
}

export { createDemoForm, createDemoRendererEnvironment };
