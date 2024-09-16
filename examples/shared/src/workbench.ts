import type {
  Diagnostic,
  FormConfig,
  FormDefinition,
  FormInstance,
  JsonSchema,
  JsonValue,
  RuleDefinition,
  UISchema,
  CompiledFormModel,
} from "@xunserver-jsf/core";
import { CompileError, compileForm, createForm, defineForm, FormRuntimeError } from "@xunserver-jsf/core";
import type { FormEnvironment } from "@xunserver-jsf/core/extension";
import type { WorkbenchDiagnoseResult, WorkbenchDocument, WorkbenchResult } from "./types.js";

export type EditorKey = "schema" | "uiSchema" | "rules" | "config" | "formData";

export const WORKBENCH_EDITORS: readonly { readonly id: EditorKey; readonly label: string }[] = Object.freeze([
  { id: "schema", label: "schema" },
  { id: "uiSchema", label: "uiSchema" },
  { id: "rules", label: "rules" },
  { id: "config", label: "config" },
  { id: "formData", label: "formData" },
]);

export function workbenchDocumentKey(document: WorkbenchDocument): string {
  return [
    document.schemaText,
    document.uiSchemaText,
    document.rulesText,
    document.configText,
    document.formDataText,
  ].join("\0");
}

export type WorkbenchCompilePlan =
  | { readonly skip: true }
  | {
      readonly skip: false;
      readonly immediate: boolean;
      readonly preserveFormOnFailure: boolean;
    };

export function planWorkbenchCompile(input: {
  readonly lastAppliedKey: string | null;
  readonly nextKey: string;
  readonly hasForm: boolean;
  readonly exampleSwitch: boolean;
}): WorkbenchCompilePlan {
  if (input.lastAppliedKey === input.nextKey) {
    return { skip: true };
  }
  const immediate = !input.hasForm || input.exampleSwitch;
  return {
    skip: false,
    immediate,
    preserveFormOnFailure: input.hasForm && !input.exampleSwitch,
  };
}

function syntaxDiagnostic(editor: EditorKey, message: string): Diagnostic {
  return Object.freeze({
    code: "playground.json-syntax",
    severity: "error",
    message: `${editor}: ${message}`,
    source: "compiler",
    metadata: Object.freeze({ editor }),
  });
}

function parseJson(text: string, editor: EditorKey): { ok: true; value: unknown } | { ok: false; diagnostic: Diagnostic } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON 无效";
    return { ok: false, diagnostic: syntaxDiagnostic(editor, message) };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type ParsedWorkbench =
  | WorkbenchDiagnoseResult
  | {
      readonly ok: true;
      readonly definition: FormDefinition;
      readonly initialValues: JsonValue;
      readonly pendingCompile: true;
    };

function parseWorkbenchDocument(document: WorkbenchDocument): ParsedWorkbench {
  const schemaParsed = parseJson(document.schemaText, "schema");
  const uiSchemaParsed = parseJson(document.uiSchemaText, "uiSchema");
  const rulesParsed = parseJson(document.rulesText, "rules");
  const configParsed = parseJson(document.configText, "config");
  const formDataParsed = parseJson(document.formDataText, "formData");

  const syntaxDiagnostics: Diagnostic[] = [];
  if (!schemaParsed.ok) {
    syntaxDiagnostics.push(schemaParsed.diagnostic);
  }
  if (!uiSchemaParsed.ok) {
    syntaxDiagnostics.push(uiSchemaParsed.diagnostic);
  }
  if (!rulesParsed.ok) {
    syntaxDiagnostics.push(rulesParsed.diagnostic);
  }
  if (!configParsed.ok) {
    syntaxDiagnostics.push(configParsed.diagnostic);
  }
  if (!formDataParsed.ok) {
    syntaxDiagnostics.push(formDataParsed.diagnostic);
  }
  if (syntaxDiagnostics.length > 0) {
    return { ok: false, stage: "parse", diagnostics: syntaxDiagnostics };
  }

  if (!schemaParsed.ok || !uiSchemaParsed.ok || !rulesParsed.ok || !configParsed.ok || !formDataParsed.ok) {
    return { ok: false, stage: "parse", diagnostics: syntaxDiagnostics };
  }

  const shapeDiagnostics: Diagnostic[] = [];
  if (!isPlainObject(schemaParsed.value) && typeof schemaParsed.value !== "boolean") {
    shapeDiagnostics.push(syntaxDiagnostic("schema", "schema 必须是 JSON Schema 对象或布尔值"));
  }
  if (!isPlainObject(uiSchemaParsed.value)) {
    shapeDiagnostics.push(syntaxDiagnostic("uiSchema", "uiSchema 必须是 JSON 对象"));
  }
  if (!Array.isArray(rulesParsed.value)) {
    shapeDiagnostics.push(syntaxDiagnostic("rules", "rules 必须是 JSON 数组"));
  }
  if (!isPlainObject(configParsed.value)) {
    shapeDiagnostics.push(syntaxDiagnostic("config", "config 必须是 JSON 对象"));
  }
  if (formDataParsed.value !== null && typeof formDataParsed.value !== "object") {
    shapeDiagnostics.push(syntaxDiagnostic("formData", "formData 必须是对象、数组或 null"));
  }
  if (shapeDiagnostics.length > 0) {
    return { ok: false, stage: "parse", diagnostics: shapeDiagnostics };
  }

  return {
    ok: true,
    definition: defineForm({
      schema: schemaParsed.value as JsonSchema,
      uiSchema: uiSchemaParsed.value as UISchema,
      rules: rulesParsed.value as RuleDefinition[],
      config: configParsed.value as FormConfig,
    }),
    initialValues: formDataParsed.value as JsonValue,
    pendingCompile: true,
  };
}

type DiagnoseWithModel =
  | WorkbenchDiagnoseResult
  | {
      readonly ok: true;
      readonly definition: FormDefinition;
      readonly diagnostics: readonly Diagnostic[];
      readonly initialValues: JsonValue;
      readonly model: CompiledFormModel;
    };

function diagnoseWithModel(document: WorkbenchDocument, environment: FormEnvironment): DiagnoseWithModel {
  const parsed = parseWorkbenchDocument(document);
  if (!parsed.ok || !("pendingCompile" in parsed)) {
    return parsed;
  }
  try {
    const compiled = compileForm(parsed.definition, { environment });
    return {
      ok: true,
      definition: parsed.definition,
      diagnostics: compiled.diagnostics,
      initialValues: parsed.initialValues,
      model: compiled.model,
    };
  } catch (error) {
    if (error instanceof CompileError) {
      return { ok: false, stage: "compile", diagnostics: error.diagnostics };
    }
    const message = error instanceof Error ? error.message : "compileForm 失败";
    return {
      ok: false,
      stage: "compile",
      diagnostics: [
        Object.freeze({
          code: "playground.compile-failed",
          severity: "error",
          message,
          source: "compiler",
        }),
      ],
    };
  }
}

export function diagnoseWorkbenchDocument(
  document: WorkbenchDocument,
  environment: FormEnvironment,
): WorkbenchDiagnoseResult {
  const diagnosed = diagnoseWithModel(document, environment);
  if (!diagnosed.ok) {
    return diagnosed;
  }
  return {
    ok: true,
    definition: diagnosed.definition,
    diagnostics: diagnosed.diagnostics,
    initialValues: diagnosed.initialValues,
  };
}

export function compileWorkbenchDocument(
  document: WorkbenchDocument,
  environment: FormEnvironment,
): WorkbenchResult {
  const diagnosed = diagnoseWithModel(document, environment);
  if (!diagnosed.ok) {
    return diagnosed;
  }
  if (!("model" in diagnosed)) {
    return { ok: false, stage: "compile", diagnostics: [] };
  }
  try {
    const form = createForm(diagnosed.model, {
      environment,
      initialValues: diagnosed.initialValues,
    });
    return {
      ok: true,
      form,
      definition: diagnosed.definition,
      diagnostics: diagnosed.diagnostics,
      initialValues: diagnosed.initialValues,
    };
  } catch (error) {
    if (error instanceof FormRuntimeError) {
      return { ok: false, stage: "create", diagnostics: error.diagnostics };
    }
    const message = error instanceof Error ? error.message : "createForm 失败";
    return {
      ok: false,
      stage: "create",
      diagnostics: [
        Object.freeze({
          code: "playground.create-failed",
          severity: "error",
          message,
          source: "runtime",
        }),
      ],
    };
  }
}

export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  if (diagnostics.length === 0) {
    return "[]";
  }
  return JSON.stringify(
    diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      source: diagnostic.source,
      ...(diagnostic.schemaPath !== undefined ? { schemaPath: diagnostic.schemaPath } : {}),
      ...(diagnostic.modelPath !== undefined ? { modelPath: diagnostic.modelPath } : {}),
      ...(diagnostic.pluginId !== undefined ? { pluginId: diagnostic.pluginId } : {}),
      ...(diagnostic.metadata !== undefined ? { metadata: diagnostic.metadata } : {}),
    })),
    null,
    2,
  );
}

export function readLiveInspection(form: FormInstance): {
  values: JsonValue;
  serialized: JsonValue;
} {
  return {
    values: form.getValues(),
    serialized: form.serialize(),
  };
}
