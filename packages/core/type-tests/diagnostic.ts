import type { Diagnostic, DiagnosticSeverity, DiagnosticSource } from "../src/diagnostic/index.js";
import type { ModelPath, SchemaPath } from "../src/path/index.js";

declare const schemaPath: SchemaPath;
declare const modelPath: ModelPath;

const minimal: Diagnostic = {
  code: "schema.unsupported",
  severity: "warning",
  message: "Keyword is not used for UI generation",
  source: "schema",
};

const withContext: Diagnostic = {
  code: "compiler.path-missing",
  severity: "error",
  message: "UI Schema references a missing ModelPath",
  source: "compiler",
  schemaPath,
  modelPath,
  pluginId: "core.compiler",
  metadata: { keyword: "properties" },
};

void minimal;
void withContext;

type ExhaustiveSeverity = {
  [K in DiagnosticSeverity]: K;
};

type ExhaustiveSource = {
  [K in DiagnosticSource]: K;
};

const severityMap: ExhaustiveSeverity = {
  error: "error",
  warning: "warning",
  info: "info",
};

const sourceMap: ExhaustiveSource = {
  schema: "schema",
  compiler: "compiler",
  plugin: "plugin",
  adapter: "adapter",
  runtime: "runtime",
};

void severityMap;
void sourceMap;

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

function severityLabel(severity: DiagnosticSeverity): string {
  switch (severity) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "info":
      return "info";
    default:
      return assertNever(severity);
  }
}

function sourceLabel(source: DiagnosticSource): string {
  switch (source) {
    case "schema":
      return "schema";
    case "compiler":
      return "compiler";
    case "plugin":
      return "plugin";
    case "adapter":
      return "adapter";
    case "runtime":
      return "runtime";
    default:
      return assertNever(source);
  }
}

void severityLabel("error");
void sourceLabel("compiler");

declare const diagnostic: Diagnostic;

// @ts-expect-error Diagnostic fields are readonly
diagnostic.message = "mutated";

// @ts-expect-error Diagnostic metadata is readonly
diagnostic.metadata = { mutated: true };

if (diagnostic.metadata) {
  // @ts-expect-error Diagnostic metadata entries are readonly
  diagnostic.metadata.keyword = "items";
}
