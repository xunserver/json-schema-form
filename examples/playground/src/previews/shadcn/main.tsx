import "./index.css";
import "@form/example-shared/preview.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FormRenderer } from "@form/react";
import { mountPreviewRuntime, type PreviewRender } from "@form/example-shared/preview-runtime";
import { createDemoRendererEnvironment } from "./renderer.js";

const environment = createDemoRendererEnvironment();

const renderPreview: PreviewRender = (host, context) => {
  const root = createRoot(host);
  root.render(
    <StrictMode>
      <div className="p-4">
        <FormRenderer
          form={context.form}
          environment={environment}
          adapterId="shadcn"
          submitHandler={context.onSubmit}
          onDiagnostic={context.onDiagnostic}
        />
      </div>
    </StrictMode>,
  );
  return () => {
    root.unmount();
  };
};

const host = document.getElementById("root");
if (host === null) {
  throw new Error("#root missing");
}

mountPreviewRuntime({
  previewId: "shadcn",
  host,
  renderPreview,
});
