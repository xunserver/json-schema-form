import type { FormDefinition } from "../definition/form-definition.js";
import type { JsonSchema } from "../definition/json-schema.js";
import { getSharedDefaultEnvironment } from "../engine/default-environment.js";
import { rememberEnvironmentIdentity } from "../engine/environment-identity.js";
import { rememberModelEnvironment } from "../engine/model-provenance.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../model/diagnostic-codes.js";
import type { CompileOptions } from "../model/compile-options.js";
import type { CompileResult } from "../model/compile-result.js";
import { CompileError } from "../model/compile-error.js";
import { compileDataModel } from "./data/data-model.js";
import { compileSchemaDynamics } from "./dynamics/compile.js";
import { DiagnosticBag, compilerError } from "./diagnostics.js";
import { emptyRuleModel, emptySchemaDynamics, emptyValidationModel } from "./empty-ports.js";
import { CloneShapeError, clonePlain, deepFreeze, isPlainObject } from "./immutable.js";
import { compileRuleModel } from "./rule/compile.js";
import { compileValidationModel } from "./validation/compile.js";
import { applyDeclaredExtensions } from "./schema/extensions.js";
import { runSchemaFrontend } from "./schema/frontend.js";
import { analyzeShapes } from "./shape/analyze.js";
import { compileUIModel } from "./ui/ui-model.js";

/**
 * 把 Form Definition 编译为不可变 `CompiledFormModel`。
 * 显式 `environment` 必须与后续 `createForm` 使用同一对象 identity。
 */
export function compileForm(definition: FormDefinition, options?: CompileOptions): CompileResult {
  const diagnostics = new DiagnosticBag();
  const snapshot = snapshotDefinition(definition, diagnostics);
  if (snapshot === undefined) {
    throw new CompileError(diagnostics.snapshot());
  }

  const environment = options?.environment ?? getSharedDefaultEnvironment();
  diagnostics.append(environment.diagnostics);

  const frontend = runSchemaFrontend(snapshot.schema, environment);
  diagnostics.append(frontend.diagnostics.snapshot());

  if (frontend.graph === undefined || diagnostics.hasErrors()) {
    throwFailure(diagnostics);
  }

  const shapes = analyzeShapes(frontend.graph, diagnostics);
  if (diagnostics.hasErrors()) {
    throwFailure(diagnostics);
  }

  const data = compileDataModel(shapes.root);
  const authoring = applyDeclaredExtensions({
    graph: frontend.graph,
    occurrences: frontend.declaredExtensions,
    data,
    uiSchema: snapshot.uiSchema,
    rules: snapshot.rules,
    config: snapshot.config,
    diagnostics,
  });
  const ui = compileUIModel(data, authoring.uiSchema, environment, diagnostics);
  const ruleResult = compileRuleModel(authoring.rules, authoring.config, data, environment, diagnostics);
  const dynamicsResult = compileSchemaDynamics(authoring.graph, data, diagnostics);
  const validationResult = compileValidationModel(
    authoring.schema,
    authoring.config,
    data,
    ruleResult.model ?? emptyRuleModel(),
    environment,
    diagnostics,
  );

  if (diagnostics.hasErrors()) {
    throwFailure(diagnostics);
  }

  const frozenDiagnostics = diagnostics.snapshot();
  const model = deepFreeze({
    data,
    ui,
    rule: ruleResult.model ?? emptyRuleModel(),
    validation: validationResult.model ?? emptyValidationModel(),
    schemaDynamics: dynamicsResult.model ?? emptySchemaDynamics(),
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
):
  | {
      readonly schema: JsonSchema;
      readonly uiSchema: FormDefinition["uiSchema"];
      readonly rules: FormDefinition["rules"];
      readonly config: FormDefinition["config"];
    }
  | undefined {
  if (!isPlainObject(definition) || !("schema" in definition)) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.INVALID_DEFINITION, "FormDefinition must be a plain object with a schema"),
    );
    return undefined;
  }

  try {
    const schema = clonePlain(definition.schema);
    const uiSchema = definition.uiSchema === undefined ? undefined : clonePlain(definition.uiSchema);
    const rules = definition.rules;
    const config = definition.config === undefined ? undefined : clonePlain(definition.config);
    return { schema, uiSchema, rules, config };
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
