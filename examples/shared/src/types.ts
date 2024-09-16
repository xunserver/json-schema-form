import type { Diagnostic, FormDefinition, FormInstance, JsonValue } from "@form/core";

export interface CatalogExampleMeta {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export interface CatalogExample extends CatalogExampleMeta {
  readonly schema: JsonValue;
  readonly uiSchema?: JsonValue;
  readonly rules?: JsonValue;
  readonly config?: JsonValue;
  readonly formData?: JsonValue;
}

export interface WorkbenchDocument {
  readonly schemaText: string;
  readonly uiSchemaText: string;
  readonly rulesText: string;
  readonly configText: string;
  readonly formDataText: string;
}

export type WorkbenchFailureStage = "parse" | "define" | "compile" | "create";

export type WorkbenchResult =
  | {
      readonly ok: true;
      readonly form: FormInstance;
      readonly definition: FormDefinition;
      readonly diagnostics: readonly Diagnostic[];
      readonly initialValues: JsonValue;
    }
  | {
      readonly ok: false;
      readonly stage: WorkbenchFailureStage;
      readonly diagnostics: readonly Diagnostic[];
    };

export type WorkbenchDiagnoseResult =
  | {
      readonly ok: true;
      readonly definition: FormDefinition;
      readonly diagnostics: readonly Diagnostic[];
      readonly initialValues: JsonValue;
    }
  | {
      readonly ok: false;
      readonly stage: WorkbenchFailureStage;
      readonly diagnostics: readonly Diagnostic[];
    };

export type PreviewId = "element-plus" | "antd" | "arco-vue" | "arco-react" | "shadcn";

export interface PreviewChrome {
  readonly id: PreviewId;
  readonly label: string;
  readonly href: string;
}

export const PREVIEW_CHROME: readonly PreviewChrome[] = Object.freeze([
  Object.freeze({ id: "element-plus", label: "Element Plus", href: "element-plus.html" }),
  Object.freeze({ id: "antd", label: "Ant Design", href: "antd.html" }),
  Object.freeze({ id: "arco-vue", label: "Arco Vue", href: "arco-vue.html" }),
  Object.freeze({ id: "arco-react", label: "Arco React", href: "arco-react.html" }),
  Object.freeze({ id: "shadcn", label: "shadcn", href: "shadcn.html" }),
]);
