import "antd/dist/reset.css";
import "@form/example-shared/preview.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import { FormRenderer } from "@form/react";
import { mountPreviewRuntime, type PreviewRender } from "@form/example-shared/preview-runtime";
import { createDemoRendererEnvironment } from "./renderer.js";

const environment = createDemoRendererEnvironment();

const renderPreview: PreviewRender = (host, context) => {
  const root = createRoot(host);
  root.render(
    <StrictMode>
      <ConfigProvider>
        <FormRenderer
          form={context.form}
          environment={environment}
          adapterId="antd"
          submitHandler={context.onSubmit}
          onDiagnostic={context.onDiagnostic}
        />
      </ConfigProvider>
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
  previewId: "antd",
  host,
  renderPreview,
});
