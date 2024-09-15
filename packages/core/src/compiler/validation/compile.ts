import type { JsonSchema } from "../../definition/json-schema.js";
import type {
  ErrorPresentationPolicy,
  FormConfig,
  ValidationTrigger,
  ValidatorUse,
} from "../../definition/form-config.js";
import type { JsonValue } from "../../definition/json-value.js";
import type { FormEnvironment } from "../../extension/environment.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import type { DataModel } from "../../model/data/data.js";
import type { CompiledRule, RuleModel } from "../../model/rule/rule.js";
import { createReadonlyKeyedCollection } from "../../model/readonly-collection.js";
import type {
  NamedValidationPlan,
  SchemaValidationPlan,
  ValidationModel,
  ValidationRulePlan,
} from "../../model/validation/validation.js";
import {
  ROOT_MODEL_PATH,
  isValidModelPath,
  toModelPath,
  type ModelPath,
} from "../../model/path/index.js";
import { DiagnosticBag, compilerError, compilerWarning } from "../diagnostics.js";
import { CloneShapeError, clonePlain, deepFreeze, isPlainObject } from "../immutable.js";
import { analyzeScopeCompatibility } from "../rule/scope.js";

export interface ValidationCompileResult {
  readonly model?: ValidationModel;
}

const TRIGGERS = new Set<ValidationTrigger>(["change", "blur", "submit", "manual"]);
const PRESENTATIONS = new Set<ErrorPresentationPolicy>([
  "always",
  "touched",
  "submitted",
  "touched-or-submitted",
  "never",
]);

export function compileValidationModel(
  schema: JsonSchema,
  config: unknown,
  data: DataModel,
  rules: RuleModel,
  environment: FormEnvironment,
  diagnostics: DiagnosticBag,
): ValidationCompileResult {
  const formConfig = readConfig(config, diagnostics);
  const validateOn = formConfig.validateOn;
  const presentation = formConfig.errorPresentation;
  const schemaPlan = compileSchemaPlan(schema, formConfig.schemaValidator, environment, diagnostics);
  const named = compileNamedUses(formConfig.validators, data, environment, validateOn, diagnostics);
  const rulePlans = compileRuleHandoff(rules.rules, diagnostics);
  const custom = named.filter((plan) => plan.kind === "sync");
  const asyncPlans = named.filter((plan) => plan.kind === "async");

  if (diagnostics.hasErrors()) {
    return {};
  }

  const indexEntries = buildIndexes([...custom, ...asyncPlans, ...rulePlans]);
  return {
    model: deepFreeze({
      schema: schemaPlan,
      custom,
      async: asyncPlans,
      rules: rulePlans,
      server: { preserveOnChange: formConfig.preserveServerErrorsOnChange },
      presentation: { policy: presentation },
      validateOn,
      byTarget: createReadonlyKeyedCollection(indexEntries.byTarget),
      byDependency: createReadonlyKeyedCollection(indexEntries.byDependency),
    }),
  };
}

interface NormalizedConfig {
  readonly validateOn: ValidationTrigger;
  readonly schemaValidator?: string;
  readonly validators: readonly unknown[];
  readonly errorPresentation: ErrorPresentationPolicy;
  readonly preserveServerErrorsOnChange: boolean;
}

function readConfig(config: unknown, diagnostics: DiagnosticBag): NormalizedConfig {
  const defaults: NormalizedConfig = {
    validateOn: "submit",
    validators: [],
    errorPresentation: "touched-or-submitted",
    preserveServerErrorsOnChange: false,
  };
  if (config === undefined) {
    return defaults;
  }
  if (!isPlainObject(config)) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.INVALID_DEFINITION, "FormConfig must be a plain object"),
    );
    return defaults;
  }
  const typed = config as FormConfig;
  let validateOn = defaults.validateOn;
  if (typed.validateOn !== undefined) {
    if (!isTrigger(typed.validateOn)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.VALIDATOR_INVALID_TRIGGER, "validateOn must be a ValidationTrigger", {
          metadata: { validateOn: typed.validateOn },
        }),
      );
    } else {
      validateOn = typed.validateOn;
    }
  }
  let schemaValidator: string | undefined;
  if (typed.schemaValidator !== undefined) {
    if (typeof typed.schemaValidator !== "string" || typed.schemaValidator.length === 0) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.VALIDATOR_MISSING, "schemaValidator key must be a non-empty string"),
      );
    } else {
      schemaValidator = typed.schemaValidator;
    }
  }
  let validators: readonly unknown[] = [];
  if (typed.validators !== undefined) {
    if (!Array.isArray(typed.validators)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.INVALID_DEFINITION, "FormConfig.validators must be an array"),
      );
    } else {
      validators = typed.validators;
    }
  }
  let errorPresentation = defaults.errorPresentation;
  if (typed.errorPresentation !== undefined) {
    if (!isPresentation(typed.errorPresentation)) {
      diagnostics.push(
        compilerError(
          COMPILER_DIAGNOSTIC_CODES.VALIDATOR_INVALID_TRIGGER,
          "errorPresentation must be a supported presentation policy",
          { metadata: { errorPresentation: typed.errorPresentation } },
        ),
      );
    } else {
      errorPresentation = typed.errorPresentation;
    }
  }
  let preserveServerErrorsOnChange = false;
  if (typed.preserveServerErrorsOnChange !== undefined) {
    if (typeof typed.preserveServerErrorsOnChange !== "boolean") {
      diagnostics.push(
        compilerError(
          COMPILER_DIAGNOSTIC_CODES.INVALID_DEFINITION,
          "preserveServerErrorsOnChange must be a boolean",
        ),
      );
    } else {
      preserveServerErrorsOnChange = typed.preserveServerErrorsOnChange;
    }
  }
  return {
    validateOn,
    ...(schemaValidator === undefined ? {} : { schemaValidator }),
    validators,
    errorPresentation,
    preserveServerErrorsOnChange,
  };
}

function compileSchemaPlan(
  schema: JsonSchema,
  explicitKey: string | undefined,
  environment: FormEnvironment,
  diagnostics: DiagnosticBag,
): SchemaValidationPlan {
  if (explicitKey !== undefined) {
    const descriptor = environment.validators.get(explicitKey);
    const inspection = environment.inspect("validators", explicitKey);
    if (descriptor === undefined) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.VALIDATOR_MISSING, "Configured schemaValidator is not registered", {
          metadata: { schemaValidator: explicitKey },
        }),
      );
      return { id: "schema", schema, unbound: true };
    }
    if (descriptor.kind !== "schema-adapter") {
      diagnostics.push(
        compilerError(
          COMPILER_DIAGNOSTIC_CODES.VALIDATOR_KIND_MISMATCH,
          "schemaValidator must reference a schema-adapter",
          {
            metadata: { schemaValidator: explicitKey, kind: descriptor.kind },
          },
        ),
      );
      return { id: "schema", schema, unbound: true };
    }
    return {
      id: "schema",
      schema,
      adapterKey: explicitKey,
      unbound: false,
      ...(inspection?.pluginId === undefined ? {} : { pluginId: inspection.pluginId }),
    };
  }

  const adapters: { readonly key: string; readonly pluginId?: string }[] = [];
  for (const key of [...environment.validators.keys()].sort()) {
    const descriptor = environment.validators.get(key);
    if (descriptor?.kind === "schema-adapter") {
      const pluginId = environment.inspect("validators", key)?.pluginId;
      if (pluginId === undefined) {
        adapters.push({ key });
      } else {
        adapters.push({ key, pluginId });
      }
    }
  }
  if (adapters.length === 1 && adapters[0] !== undefined) {
    return {
      id: "schema",
      schema,
      adapterKey: adapters[0].key,
      unbound: false,
      ...(adapters[0].pluginId === undefined ? {} : { pluginId: adapters[0].pluginId }),
    };
  }
  if (adapters.length === 0) {
    diagnostics.push(
      compilerWarning(
        COMPILER_DIAGNOSTIC_CODES.SCHEMA_ADAPTER_UNBOUND,
        "No Schema Validator Adapter is registered",
      ),
    );
    return { id: "schema", schema, unbound: true };
  }
  diagnostics.push(
    compilerError(
      COMPILER_DIAGNOSTIC_CODES.SCHEMA_ADAPTER_AMBIGUOUS,
      "Multiple Schema Validator Adapters are registered; set schemaValidator explicitly",
      {
        metadata: { candidates: Object.freeze(adapters.map((item) => item.key)) },
      },
    ),
  );
  return { id: "schema", schema, unbound: true };
}

function compileNamedUses(
  uses: readonly unknown[],
  data: DataModel,
  environment: FormEnvironment,
  defaultTrigger: ValidationTrigger,
  diagnostics: DiagnosticBag,
): NamedValidationPlan[] {
  const plans: NamedValidationPlan[] = [];
  for (let index = 0; index < uses.length; index += 1) {
    const item = uses[index];
    if (!isPlainObject(item)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.INVALID_DEFINITION, "Validator use must be a plain object", {
          metadata: { index },
        }),
      );
      continue;
    }
    const use = item as unknown as ValidatorUse;
    if (typeof use.validator !== "string" || use.validator.length === 0) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.VALIDATOR_MISSING, "Validator use is missing a Registry key", {
          metadata: { index },
        }),
      );
      continue;
    }
    const descriptor = environment.validators.get(use.validator);
    const inspection = environment.inspect("validators", use.validator);
    if (descriptor === undefined) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.VALIDATOR_MISSING, "Named validator is not registered", {
          metadata: { index, validator: use.validator },
        }),
      );
      continue;
    }
    if (descriptor.kind !== "sync" && descriptor.kind !== "async") {
      diagnostics.push(
        compilerError(
          COMPILER_DIAGNOSTIC_CODES.VALIDATOR_KIND_MISMATCH,
          "Named validator use must reference a sync or async validator",
          {
            metadata: { index, validator: use.validator, kind: descriptor.kind },
          },
        ),
      );
      continue;
    }
    const target = parseModelPathValue(use.target, index, "target", diagnostics);
    if (target === undefined) {
      continue;
    }
    if (!hasNode(data, target)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.VALIDATOR_INVALID_TARGET, "Validator target does not exist", {
          modelPath: target,
          metadata: { index, validator: use.validator },
        }),
      );
    }
    const dependencies = readDependencies(use.dependencies, index, diagnostics);
    for (const dependency of dependencies) {
      if (!hasNode(data, dependency)) {
        diagnostics.push(
          compilerError(COMPILER_DIAGNOSTIC_CODES.VALIDATOR_INVALID_TARGET, "Validator dependency does not exist", {
            modelPath: dependency,
            metadata: { index, validator: use.validator, dependency },
          }),
        );
      }
      if (analyzeScopeCompatibility(target, dependency) === "ambiguous") {
        diagnostics.push(
          compilerError(
            COMPILER_DIAGNOSTIC_CODES.VALIDATOR_SCOPE_AMBIGUOUS,
            "Validator dependency cannot be uniquely bound to the target array scope",
            {
              modelPath: target,
              metadata: { index, validator: use.validator, dependency },
            },
          ),
        );
      }
    }
    const triggers = readTriggers(use.trigger, defaultTrigger, index, diagnostics);
    let options: JsonValue | undefined;
    if (use.options !== undefined) {
      try {
        options = clonePlain(use.options, true) as JsonValue;
      } catch (error) {
        const reason = error instanceof CloneShapeError ? error.reason : "non-plain-object";
        diagnostics.push(
          compilerError(
            COMPILER_DIAGNOSTIC_CODES.VALIDATOR_INVALID_OPTIONS,
            "Validator options must be JSON-compatible",
            {
              metadata: { index, validator: use.validator, reason },
            },
          ),
        );
      }
    }
    const id = `${descriptor.kind}:${String(index).padStart(4, "0")}:${use.validator}`;
    plans.push(
      deepFreeze({
        id,
        key: use.validator,
        kind: descriptor.kind,
        target,
        dependencies,
        triggers,
        ...(options === undefined ? {} : { options }),
        ...(inspection?.pluginId === undefined ? {} : { pluginId: inspection.pluginId }),
      }),
    );
  }
  return plans;
}

function compileRuleHandoff(
  rules: readonly CompiledRule[],
  diagnostics: DiagnosticBag,
): ValidationRulePlan[] {
  const plans: ValidationRulePlan[] = [];
  for (const rule of rules) {
    if (rule.kind !== "validation") {
      continue;
    }
    if (rule.action.kind !== "validation") {
      diagnostics.push(
        compilerError(
          COMPILER_DIAGNOSTIC_CODES.VALIDATION_RULE_INVALID,
          "Validation Rule handoff is missing validation action metadata",
          {
            modelPath: rule.target,
            metadata: { ruleId: rule.id },
          },
        ),
      );
      continue;
    }
    if (typeof rule.action.failure.code !== "string" || rule.action.failure.code.length === 0) {
      diagnostics.push(
        compilerError(
          COMPILER_DIAGNOSTIC_CODES.VALIDATION_RULE_INVALID,
          "Validation Rule failure metadata is invalid",
          {
            modelPath: rule.target,
            metadata: { ruleId: rule.id },
          },
        ),
      );
      continue;
    }
    plans.push(
      deepFreeze({
        id: `rule:${rule.id}`,
        ruleId: rule.id,
        target: rule.target,
        dependencies: rule.dependencies,
        code: rule.action.failure.code,
        message: rule.action.failure.message,
        ...(rule.action.failure.params === undefined ? {} : { params: rule.action.failure.params }),
      }),
    );
  }
  return plans;
}

function readDependencies(
  value: unknown,
  index: number,
  diagnostics: DiagnosticBag,
): readonly ModelPath[] {
  if (value === undefined) {
    diagnostics.push(
      compilerError(
        COMPILER_DIAGNOSTIC_CODES.VALIDATOR_INVALID_TARGET,
        "Validator use must declare an explicit dependencies array",
        { metadata: { index } },
      ),
    );
    return [];
  }
  if (!Array.isArray(value)) {
    diagnostics.push(
      compilerError(
        COMPILER_DIAGNOSTIC_CODES.VALIDATOR_INVALID_TARGET,
        "Validator dependencies must be an array of ModelPath values",
        { metadata: { index } },
      ),
    );
    return [];
  }
  const paths: ModelPath[] = [];
  for (const item of value) {
    const path = parseModelPathValue(item, index, "dependency", diagnostics);
    if (path !== undefined) {
      paths.push(path);
    }
  }
  return paths;
}

function readTriggers(
  value: unknown,
  fallback: ValidationTrigger,
  index: number,
  diagnostics: DiagnosticBag,
): readonly ValidationTrigger[] {
  if (value === undefined) {
    return Object.freeze([fallback]);
  }
  const items = Array.isArray(value) ? value : [value];
  const triggers: ValidationTrigger[] = [];
  for (const item of items) {
    if (!isTrigger(item)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.VALIDATOR_INVALID_TRIGGER, "Validator trigger is not supported", {
          metadata: { index, trigger: item },
        }),
      );
      continue;
    }
    if (!triggers.includes(item)) {
      triggers.push(item);
    }
  }
  return Object.freeze(triggers.length === 0 ? [fallback] : triggers);
}

function parseModelPathValue(
  value: unknown,
  index: number,
  role: string,
  diagnostics: DiagnosticBag,
): ModelPath | undefined {
  if (typeof value !== "string" || !isValidModelPath(value)) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.VALIDATOR_INVALID_TARGET, `Validator ${role} is not a ModelPath`, {
        metadata: { index, [role]: value },
      }),
    );
    return undefined;
  }
  return toModelPath(value) ?? ROOT_MODEL_PATH;
}

function hasNode(data: DataModel, path: ModelPath): boolean {
  return path === ROOT_MODEL_PATH || data.nodes.has(path);
}

function isTrigger(value: unknown): value is ValidationTrigger {
  return typeof value === "string" && TRIGGERS.has(value as ValidationTrigger);
}

function isPresentation(value: unknown): value is ErrorPresentationPolicy {
  return typeof value === "string" && PRESENTATIONS.has(value as ErrorPresentationPolicy);
}

function buildIndexes(plans: readonly (NamedValidationPlan | ValidationRulePlan)[]): {
  readonly byTarget: Array<readonly [ModelPath, readonly string[]]>;
  readonly byDependency: Array<readonly [ModelPath, readonly string[]]>;
} {
  const byTarget = new Map<ModelPath, string[]>();
  const byDependency = new Map<ModelPath, string[]>();
  const add = (map: Map<ModelPath, string[]>, path: ModelPath, id: string): void => {
    const list = map.get(path);
    if (list === undefined) {
      map.set(path, [id]);
      return;
    }
    if (!list.includes(id)) {
      list.push(id);
    }
  };
  for (const plan of plans) {
    add(byTarget, plan.target, plan.id);
    for (const dependency of plan.dependencies) {
      add(byDependency, dependency, plan.id);
    }
  }
  return {
    byTarget: [...byTarget.entries()].map(([path, ids]) => [path, Object.freeze([...ids])] as const),
    byDependency: [...byDependency.entries()].map(([path, ids]) => [path, Object.freeze([...ids])] as const),
  };
}
