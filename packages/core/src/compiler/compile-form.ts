import type { FormDefinition } from "../definition/form-definition.js";
import type { JsonSchema } from "../definition/json-schema.js";
import { getSharedDefaultEnvironment } from "../lifecycle/default-environment.js";
import { rememberEnvironmentIdentity } from "../lifecycle/environment-identity.js";
import { rememberModelEnvironment } from "../lifecycle/model-provenance.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../model/diagnostic-codes.js";
import type { CompileOptions } from "../model/compile-options.js";
import type { CompileResult } from "../model/compile-result.js";
import { CompileError } from "../model/compile-error.js";
import { compileDataModel } from "./data-model.js";
import { DiagnosticBag, compilerError } from "./diagnostics.js";
import { emptyRuleModel, emptySchemaDynamics, emptyValidationModel } from "./empty-ports.js";
import { CloneShapeError, clonePlain, deepFreeze, isPlainObject } from "./immutable.js";
import { runSchemaFrontend } from "./schema/frontend.js";
import { analyzeShapes } from "./shape/analyze.js";
import { compileUIModel } from "./ui-model.js";

export function compileForm(definition: FormDefinition, options?: CompileOptions): CompileResult {
  const diagnostics = new DiagnosticBag();
  const snapshot = snapshotDefinition(definition, diagnostics);
  if (snapshot === undefined) {
    throw new CompileError(diagnostics.snapshot());
  }

  const environment = options?.environment ?? getSharedDefaultEnvironment();
  diagnostics.append(environment.diagnostics);

  const frontend = runSchemaFrontend(snapshot.schema);
  diagnostics.append(frontend.diagnostics.snapshot());

  if (frontend.graph === undefined || diagnostics.hasErrors()) {
    throwFailure(diagnostics);
  }

  const shapes = analyzeShapes(frontend.graph, diagnostics);
  if (diagnostics.hasErrors()) {
    throwFailure(diagnostics);
  }

  const data = compileDataModel(shapes.root);
  const ui = compileUIModel(data, snapshot.uiSchema, environment, diagnostics);

  if (diagnostics.hasErrors()) {
    throwFailure(diagnostics);
  }

  const frozenDiagnostics = diagnostics.snapshot();
  const model = deepFreeze({
    data,
    ui,
    rule: emptyRuleModel(),
    validation: emptyValidationModel(),
    schemaDynamics: emptySchemaDynamics(),
    diagnostics: frozenDiagnostics,
  });
  rememberModelEnvironment(model, rememberEnvironmentIdentity(environment));

  return {
    model,
    diagnostics: frozenDiagnostics,
  };
}

function snapshotDefinition(
  definition: FormDefinition,
  diagnostics: DiagnosticBag,
): { readonly schema: JsonSchema; readonly uiSchema: FormDefinition["uiSchema"] } | undefined {
  if (!isPlainObject(definition) || !("schema" in definition)) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.INVALID_DEFINITION, "FormDefinition must be a plain object with a schema"),
    );
    return undefined;
  }

  try {
    const schema = clonePlain(definition.schema);
    const uiSchema = definition.uiSchema === undefined ? undefined : clonePlain(definition.uiSchema);
    return { schema, uiSchema };
  } catch (error) {
    const reason = error instanceof CloneShapeError ? error.reason : "non-plain-object";
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.INVALID_DEFINITION, "FormDefinition could not be snapshotted", {
        metadata: { reason },
      }),
    );
    return undefined;
  }
}

function throwFailure(diagnostics: DiagnosticBag): never {
  throw new CompileError(diagnostics.snapshot().filter((item) => item.severity === "error"));
}
