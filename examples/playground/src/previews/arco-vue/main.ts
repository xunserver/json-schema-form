import "@arco-design/web-vue/dist/arco.css";
import "@form/example-shared/preview.css";
import { createApp, h } from "vue";
import { FormRenderer } from "@form/vue";
import { mountPreviewRuntime, type PreviewRender } from "@form/example-shared/preview-runtime";
import { createDemoRendererEnvironment } from "./renderer.js";

const environment = createDemoRendererEnvironment();

const renderPreview: PreviewRender = (host, context) => {
  const app = createApp({
    render: () =>
      h(FormRenderer, {
        form: context.form,
        environment,
        adapterId: "arco-vue",
        submitHandler: context.onSubmit,
        onDiagnostic: context.onDiagnostic,
      }),
  });
  app.mount(host);
  return () => {
    app.unmount();
  };
};

const host = document.getElementById("app");
if (host === null) {
  throw new Error("#app missing");
}

mountPreviewRuntime({
  previewId: "arco-vue",
  host,
  renderPreview,
});
