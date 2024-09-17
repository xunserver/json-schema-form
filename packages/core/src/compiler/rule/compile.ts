import type {
  ComputedRuleDefinition,
  EffectRuleDefinition,
  RuleDefinition,
  StateRuleDefinition,
  ValidationRuleDefinition,
} from "../../definition/rule-definition.js";
import type { FormEnvironment } from "../../extension/environment.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import type { DataModel } from "../../model/data/data.js";
import type {
  CompiledRule,
  CompiledRuleAction,
  NormalizedRuleExpression,
  RuleModel,
  SerializationPlan,
} from "../../model/rule/rule.js";
import { createReadonlyKeyedCollection } from "../../model/readonly-collection.js";
import {
  ROOT_MODEL_PATH,
  isValidModelPath,
  toModelPath,
  type ModelPath,
} from "../../model/path/index.js";
import { DiagnosticBag, compilerError } from "../diagnostics.js";
import { CloneShapeError, clonePlain, deepFreeze, isPlainObject } from "../immutable.js";
import {
  RuleParseError,
  collectCallNames,
  collectFieldPaths,
  parseRuleExpression,
} from "./expression.js";
import { buildComputedGraph } from "./graph.js";
import { analyzeScopeCompatibility } from "./scope.js";

export interface RuleCompileResult {
  readonly model?: RuleModel;
}

const STATE_ASPECTS = ["active", "visible", "disabled", "readonly"] as const;

export function compileRuleModel(
  rules: unknown,
  config: unknown,
  data: DataModel,
  environment: FormEnvironment,
  diagnostics: DiagnosticBag,
): RuleCompileResult {
  const authored = readRuleList(rules, diagnostics);
  const compiled: CompiledRule[] = [];
  const usedIds = new Map<string, number>();
  const writers = new Map<ModelPath, string[]>();

  for (let index = 0; index < authored.length; index += 1) {
    const rule = authored[index]!;
    const compiledRule = compileOne(rule, index, data, environment, diagnostics, usedIds, writers);
    if (compiledRule !== undefined) {
      compiled.push(compiledRule);
    }
  }

  const writerMap = new Map<ModelPath, string>();
  for (const [path, ids] of writers) {
    const unique = [...new Set(ids)];
    if (unique.length > 1) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_MULTI_WRITER, "Computed target has multiple writers", {
          modelPath: path,
          metadata: { ruleIds: Object.freeze(unique) },
        }),
      );
    } else if (unique[0] !== undefined) {
      writerMap.set(path, unique[0]);
    }
  }

  const graph = buildComputedGraph(compiled, writerMap);
  if (graph.cycle !== undefined) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_COMPUTED_CYCLE, "Computed rules form a cycle", {
        metadata: { cycle: Object.freeze([...graph.cycle]) },
      }),
    );
  }

  const serialization = compileSerialization(config, environment, diagnostics);

  if (diagnostics.hasErrors()) {
    return {};
  }

  const byPathEntries = buildByPath(compiled);
  const model: RuleModel = deepFreeze({
    rules: compiled,
    byPath: createReadonlyKeyedCollection(byPathEntries),
    computedOrder: graph.order,
    serialization,
  });
  return { model };
}

function readRuleList(rules: unknown, diagnostics: DiagnosticBag): RuleDefinition[] {
  if (rules === undefined) {
    return [];
  }
  if (!Array.isArray(rules)) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.INVALID_DEFINITION, "FormDefinition.rules must be an array"),
    );
    return [];
  }
  const result: RuleDefinition[] = [];
  for (let index = 0; index < rules.length; index += 1) {
    const item = rules[index];
    try {
      result.push(clonePlain(item, true) as RuleDefinition);
    } catch (error) {
      const reason = error instanceof CloneShapeError ? error.reason : "non-plain-object";
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_AST, "Rule definition is not a JSON-compatible AST", {
          metadata: { index, reason },
        }),
      );
    }
  }
  return result;
}

function compileOne(
  rule: RuleDefinition,
  index: number,
  data: DataModel,
  environment: FormEnvironment,
  diagnostics: DiagnosticBag,
  usedIds: Map<string, number>,
  writers: Map<ModelPath, string[]>,
): CompiledRule | undefined {
  if (!isPlainObject(rule) || typeof rule.kind !== "string") {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_ACTION, "Rule must declare a kind", {
        metadata: { index },
      }),
    );
    return undefined;
  }

  const targetInput = "target" in rule ? rule.target : undefined;
  const target = parseTarget(targetInput, rule.kind === "effect", index, diagnostics);
  if (target === undefined && rule.kind !== "effect") {
    return undefined;
  }
  const resolvedTarget = target ?? ROOT_MODEL_PATH;
  if (rule.kind !== "effect" || target !== undefined) {
    if (!hasNode(data, resolvedTarget)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_MISSING_TARGET, "Rule target does not exist", {
          modelPath: resolvedTarget,
          metadata: { index, kind: rule.kind },
        }),
      );
    }
  }

  const id = resolveId(rule, index, resolvedTarget, usedIds, diagnostics);
  const when = rule.when === undefined ? undefined : parseExpression(rule.when, index, "when", diagnostics);
  if (when !== undefined && !isBooleanShaped(when)) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_STATE, "Rule when expressions must be boolean-shaped", {
        modelPath: resolvedTarget,
        metadata: { index, ruleId: id },
      }),
    );
  }
  let action: CompiledRuleAction | undefined;
  const extraDependencies: ModelPath[] = [];
  const extraCalls: string[] = [];

  switch (rule.kind) {
    case "state":
      action = compileState(rule, resolvedTarget, index, diagnostics);
      break;
    case "computed":
      action = compileComputed(rule, index, diagnostics);
      if (action !== undefined) {
        const list = writers.get(resolvedTarget) ?? [];
        list.push(id);
        writers.set(resolvedTarget, list);
      }
      break;
    case "validation":
      action = compileValidation(rule, index, diagnostics);
      break;
    case "effect":
      action = compileEffect(rule, data, index, diagnostics, extraDependencies, extraCalls);
      break;
    default:
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_ACTION, "Unsupported rule kind", {
          metadata: { index, kind: (rule as { kind?: unknown }).kind },
        }),
      );
      return undefined;
  }

  if (action === undefined) {
    return undefined;
  }

  const expressionDeps = [
    ...(when === undefined ? [] : collectFieldPaths(when)),
    ...actionDependencies(action),
    ...extraDependencies,
  ];
  const dependencies = uniquePaths(expressionDeps);
  for (const dependency of dependencies) {
    if (!hasNode(data, dependency)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_MISSING_TARGET, "Rule dependency path does not exist", {
          modelPath: dependency,
          metadata: { index, ruleId: id },
        }),
      );
    }
    if (analyzeScopeCompatibility(resolvedTarget, dependency) === "ambiguous") {
      diagnostics.push(
        compilerError(
          COMPILER_DIAGNOSTIC_CODES.RULE_SCOPE_AMBIGUOUS,
          "Rule dependency cannot be uniquely bound to the target array scope",
          {
            modelPath: resolvedTarget,
            metadata: { index, ruleId: id, dependency },
          },
        ),
      );
    }
  }

  const functionKeys = uniqueStrings([
    ...(when === undefined ? [] : collectCallNames(when)),
    ...actionCalls(action),
    ...extraCalls,
  ]);
  for (const key of functionKeys) {
    if (!environment.ruleFunctions.has(key)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_MISSING_FUNCTION, "Rule function is not registered", {
          modelPath: resolvedTarget,
          metadata: { index, ruleId: id, functionKey: key },
        }),
      );
    }
  }

  return deepFreeze({
    id,
    kind: rule.kind,
    target: resolvedTarget,
    ...(when === undefined ? {} : { when }),
    dependencies,
    functionKeys,
    action,
  });
}

function compileState(
  rule: StateRuleDefinition,
  target: ModelPath,
  index: number,
  diagnostics: DiagnosticBag,
): CompiledRuleAction | undefined {
  if (!isPlainObject(rule.action)) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_ACTION, "State rule action is required", {
        metadata: { index },
      }),
    );
    return undefined;
  }
  const aspects: Partial<Record<(typeof STATE_ASPECTS)[number], NormalizedRuleExpression>> = {};
  for (const aspect of STATE_ASPECTS) {
    const expression = rule.action[aspect];
    if (expression === undefined) {
      continue;
    }
    const parsed = parseExpression(expression, index, `action.${aspect}`, diagnostics);
    if (parsed !== undefined) {
      if (!isBooleanShaped(parsed)) {
        diagnostics.push(
          compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_STATE, "State rule aspects must be boolean-shaped", {
            modelPath: target,
            metadata: { index, aspect },
          }),
        );
      }
      aspects[aspect] = parsed;
    }
  }
  if (Object.keys(aspects).length === 0) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_STATE, "State rule must declare at least one aspect", {
        modelPath: target,
        metadata: { index },
      }),
    );
    return undefined;
  }
  if (aspects.active !== undefined && target === ROOT_MODEL_PATH) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_ACTIVE_ROOT, "Active rules cannot target the form root", {
        modelPath: target,
        metadata: { index },
      }),
    );
  }
  return { kind: "state", aspects };
}

function compileComputed(
  rule: ComputedRuleDefinition,
  index: number,
  diagnostics: DiagnosticBag,
): CompiledRuleAction | undefined {
  if (!isPlainObject(rule.action) || !("value" in rule.action)) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_ACTION, "Computed rule must declare a value expression", {
        metadata: { index },
      }),
    );
    return undefined;
  }
  const value = parseExpression(rule.action.value, index, "action.value", diagnostics);
  if (value === undefined) {
    return undefined;
  }
  return { kind: "computed", value };
}

function compileValidation(
  rule: ValidationRuleDefinition,
  index: number,
  diagnostics: DiagnosticBag,
): CompiledRuleAction | undefined {
  if (!isPlainObject(rule.action) || rule.action.assertion === undefined || !isPlainObject(rule.action.failure)) {
    diagnostics.push(
      compilerError(
        COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_ACTION,
        "Validation rule must declare assertion and failure metadata",
        { metadata: { index } },
      ),
    );
    return undefined;
  }
  const failure = rule.action.failure;
  if (typeof failure.code !== "string" || failure.code.length === 0 || typeof failure.message !== "string") {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_ACTION, "Validation failure metadata is invalid", {
        metadata: { index },
      }),
    );
    return undefined;
  }
  if ("instancePath" in failure || "asyncToken" in failure || "server" in failure) {
    diagnostics.push(
      compilerError(
        COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_ACTION,
        "Validation metadata cannot include runtime ValidationError state",
        { metadata: { index } },
      ),
    );
  }
  const assertion = parseExpression(rule.action.assertion, index, "action.assertion", diagnostics);
  if (assertion === undefined) {
    return undefined;
  }
  let params: CompiledRuleAction extends never ? never : import("../../definition/json-value.js").JsonValue | undefined;
  if (failure.params !== undefined) {
    try {
      params = clonePlain(failure.params, true) as import("../../definition/json-value.js").JsonValue;
    } catch {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_AST, "Validation failure params must be JSON-compatible", {
          metadata: { index },
        }),
      );
    }
  }
  return {
    kind: "validation",
    assertion,
    failure: {
      code: failure.code,
      message: failure.message,
      ...(params === undefined ? {} : { params }),
    },
  };
}

function compileEffect(
  rule: EffectRuleDefinition,
  data: DataModel,
  index: number,
  diagnostics: DiagnosticBag,
  extraDependencies: ModelPath[],
  extraCalls: string[],
): CompiledRuleAction | undefined {
  if (!isPlainObject(rule.action) || !Array.isArray(rule.action.actions)) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_ACTION, "Effect rule must declare setValue actions", {
        metadata: { index },
      }),
    );
    return undefined;
  }
  const actions: { readonly type: "setValue"; readonly target: ModelPath; readonly value: NormalizedRuleExpression }[] =
    [];
  for (let actionIndex = 0; actionIndex < rule.action.actions.length; actionIndex += 1) {
    const item = rule.action.actions[actionIndex];
    if (!isPlainObject(item) || item.type !== "setValue") {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_ACTION, "Effect rules only accept static setValue actions", {
          metadata: { index, actionIndex, type: isPlainObject(item) ? item.type : typeof item },
        }),
      );
      continue;
    }
    const target = parseTarget(item.target, false, index, diagnostics);
    if (target === undefined) {
      continue;
    }
    if (!hasNode(data, target)) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_MISSING_TARGET, "Effect write target does not exist", {
          modelPath: target,
          metadata: { index, actionIndex },
        }),
      );
    }
    const value = parseExpression(item.value, index, `action.actions.${actionIndex}.value`, diagnostics);
    if (value === undefined) {
      continue;
    }
    extraDependencies.push(...collectFieldPaths(value), target);
    extraCalls.push(...collectCallNames(value));
    actions.push({ type: "setValue", target, value });
  }
  return { kind: "effect", actions };
}

function compileSerialization(
  config: unknown,
  environment: FormEnvironment,
  diagnostics: DiagnosticBag,
): SerializationPlan {
  let serializeInactive = false;
  let serializer: string | undefined;
  let valueInitializer: string | undefined;
  if (config === undefined) {
    return deepFreeze({ serializeInactive });
  }
  if (!isPlainObject(config)) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.INVALID_DEFINITION, "FormConfig must be a plain object"),
    );
    return deepFreeze({ serializeInactive });
  }
  if (config.serializeInactive !== undefined) {
    if (typeof config.serializeInactive !== "boolean") {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.INVALID_DEFINITION, "serializeInactive must be a boolean"),
      );
    } else {
      serializeInactive = config.serializeInactive;
    }
  }
  if (config.serializer !== undefined) {
    if (typeof config.serializer !== "string" || config.serializer.length === 0) {
      diagnostics.push(
        compilerError(COMPILER_DIAGNOSTIC_CODES.SERIALIZER_MISSING, "serializer key must be a non-empty string"),
      );
    } else {
      serializer = config.serializer;
      if (!environment.serializers.has(serializer)) {
        diagnostics.push(
          compilerError(COMPILER_DIAGNOSTIC_CODES.SERIALIZER_MISSING, "Configured serializer is not registered", {
            metadata: { serializer },
          }),
        );
      }
    }
  }
  if (config.valueInitializer !== undefined) {
    if (typeof config.valueInitializer !== "string" || config.valueInitializer.length === 0) {
      diagnostics.push(
        compilerError(
          COMPILER_DIAGNOSTIC_CODES.INITIALIZER_MISSING,
          "valueInitializer key must be a non-empty string",
        ),
      );
    } else {
      valueInitializer = config.valueInitializer;
      if (!environment.valueInitializers.has(valueInitializer)) {
        diagnostics.push(
          compilerError(
            COMPILER_DIAGNOSTIC_CODES.INITIALIZER_MISSING,
            "Configured value initializer is not registered",
            {
              metadata: { valueInitializer },
            },
          ),
        );
      }
    }
  }
  return deepFreeze({
    serializeInactive,
    ...(serializer === undefined ? {} : { serializer }),
    ...(valueInitializer === undefined ? {} : { valueInitializer }),
  });
}

function parseExpression(
  value: unknown,
  index: number,
  pointer: string,
  diagnostics: DiagnosticBag,
): NormalizedRuleExpression | undefined {
  try {
    return parseRuleExpression(value, pointer);
  } catch (error) {
    const reason = error instanceof RuleParseError ? error.reason : "non-json";
    const location = error instanceof RuleParseError ? error.pointer : pointer;
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_AST, "Rule expression is not a supported AST", {
        metadata: { index, pointer: location, reason },
      }),
    );
    return undefined;
  }
}

function parseTarget(
  value: unknown,
  optional: boolean,
  index: number,
  diagnostics: DiagnosticBag,
): ModelPath | undefined {
  if (value === undefined) {
    if (optional) {
      return undefined;
    }
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_MISSING_TARGET, "Rule target is required", {
        metadata: { index },
      }),
    );
    return undefined;
  }
  if (typeof value !== "string" || !isValidModelPath(value)) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_MISSING_TARGET, "Rule target is not a ModelPath", {
        metadata: { index, target: value },
      }),
    );
    return undefined;
  }
  return toModelPath(value) ?? ROOT_MODEL_PATH;
}

function resolveId(
  rule: RuleDefinition,
  index: number,
  target: ModelPath,
  usedIds: Map<string, number>,
  diagnostics: DiagnosticBag,
): string {
  const explicit = rule.id;
  let id: string;
  if (explicit === undefined) {
    id = `rule:${String(index).padStart(4, "0")}:${rule.kind}:${target || "root"}`;
  } else if (typeof explicit !== "string" || explicit.length === 0 || explicit.trim() !== explicit) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_INVALID_ID, "Rule id must be a non-empty string", {
        metadata: { index },
      }),
    );
    id = `rule:${String(index).padStart(4, "0")}:${rule.kind}:${target || "root"}`;
  } else {
    id = explicit;
  }
  const existing = usedIds.get(id);
  if (existing !== undefined) {
    diagnostics.push(
      compilerError(COMPILER_DIAGNOSTIC_CODES.RULE_DUPLICATE_ID, `Duplicate rule id "${id}"`, {
        metadata: { index, firstIndex: existing, ruleId: id },
      }),
    );
  } else {
    usedIds.set(id, index);
  }
  return id;
}

function hasNode(data: DataModel, path: ModelPath): boolean {
  if (path === ROOT_MODEL_PATH) {
    return true;
  }
  return data.nodes.has(path);
}

function actionDependencies(action: CompiledRuleAction): ModelPath[] {
  switch (action.kind) {
    case "state":
      return Object.values(action.aspects).flatMap((expression) =>
        expression === undefined ? [] : collectFieldPaths(expression),
      );
    case "computed":
      return collectFieldPaths(action.value);
    case "validation":
      return collectFieldPaths(action.assertion);
    case "effect":
      return action.actions.flatMap((item) => [item.target, ...collectFieldPaths(item.value)]);
  }
}

function actionCalls(action: CompiledRuleAction): string[] {
  switch (action.kind) {
    case "state":
      return Object.values(action.aspects).flatMap((expression) =>
        expression === undefined ? [] : collectCallNames(expression),
      );
    case "computed":
      return collectCallNames(action.value);
    case "validation":
      return collectCallNames(action.assertion);
    case "effect":
      return action.actions.flatMap((item) => collectCallNames(item.value));
  }
}

function buildByPath(rules: readonly CompiledRule[]): (readonly [ModelPath, readonly string[]])[] {
  const map = new Map<ModelPath, string[]>();
  for (const rule of rules) {
    for (const path of rule.dependencies) {
      const list = map.get(path) ?? [];
      if (!list.includes(rule.id)) {
        list.push(rule.id);
      }
      map.set(path, list);
    }
  }
  return [...map.entries()].map(([path, ids]) => [path, Object.freeze([...ids])] as const);
}

function uniquePaths(paths: readonly ModelPath[]): ModelPath[] {
  const seen = new Set<string>();
  const result: ModelPath[] = [];
  for (const path of paths) {
    if (!seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
}

function isBooleanShaped(expression: NormalizedRuleExpression): boolean {
  if (expression.kind === "literal") {
    return typeof expression.value === "boolean";
  }
  if (expression.kind === "const") {
    return typeof expression.value === "boolean";
  }
  return true;
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}
