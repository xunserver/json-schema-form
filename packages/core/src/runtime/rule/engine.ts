import type { Diagnostic } from "../../diagnostic/index.js";
import type { CompiledFormModel } from "../../model/compiled-form-model.js";
import type { CompiledRule } from "../../model/rule.js";
import type { StateRuleAspect } from "../../definition/rule-definition.js";
import type { FormEnvironment } from "../../extension/environment.js";
import { bindTemplatePath, modelPathListCount } from "../../path/bind-path.js";
import {
  ROOT_INSTANCE_PATH,
  ROOT_MODEL_PATH,
  instancePathAncestors,
  joinInstancePath,
  parseInstancePath,
  type InstancePath,
  type ModelPath,
} from "../../path/index.js";
import type { RuntimeCommand } from "../commands.js";
import type { TransactionDraft } from "../commands.js";
import type { EffectiveState, JsonValue, SerializeOptions } from "../contracts.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import { runtimeDiagnostic, sortRuntimeDiagnostics } from "../diagnostics.js";
import { FormRuntimeError } from "../error.js";
import { combineEffectiveState, DEFAULT_EFFECTIVE } from "../effective.js";
import { cloneJsonValue, getJsonAt, jsonEqual, JsonCloneError } from "../json-value.js";
import type { RuntimeNodeId } from "../runtime-node-id.js";
import { pruneInactiveValues } from "../serialize.js";
import type { RuntimeSubtreeOwner, SubtreeCleanupPlan, SubtreeDescriptor } from "../subtree-lifecycle.js";
import { evaluateActivationPredicate } from "../dynamics/activation.js";
import { evaluateRuleExpression } from "./evaluator.js";

export interface AffectedValidationRuleBinding {
  readonly ruleId: string;
  readonly target: InstancePath;
}

export interface AffectedValidationRulePlan {
  readonly bindings: readonly AffectedValidationRuleBinding[];
}

export interface RuleEngineStats {
  evaluatedRules: number;
  scheduledRules: number;
}

export interface RuleDraftState {
  schemaActive: Map<string, boolean>;
  combined: Map<string, Partial<Record<StateRuleAspect, boolean>>>;
  instanceResults: Map<string, Partial<Record<StateRuleAspect, boolean>>>;
  derivedChanged: boolean;
  validationBindings: AffectedValidationRuleBinding[];
  oneOfDiagnostics: Diagnostic[];
}

const ASPECTS: readonly StateRuleAspect[] = ["active", "visible", "disabled", "readonly"];

export class RuleDynamicsEngine implements RuntimeSubtreeOwner {
  readonly name = "rule-dynamics";
  readonly stats: RuleEngineStats = { evaluatedRules: 0, scheduledRules: 0 };
  private readonly rulesById: ReadonlyMap<string, CompiledRule>;
  private readonly computedTargets: ReadonlySet<ModelPath>;
  private committed: RuleDraftState;
  private forgotten = new Set<string>();

  constructor(
    private readonly model: CompiledFormModel,
    private readonly environment: FormEnvironment,
  ) {
    this.rulesById = new Map(model.rule.rules.map((rule) => [rule.id, rule]));
    this.computedTargets = new Set(
      model.rule.rules.filter((rule) => rule.kind === "computed").map((rule) => rule.target),
    );
    this.committed = emptyState();
  }

  plan(descriptor: SubtreeDescriptor): SubtreeCleanupPlan {
    const ids = [...descriptor.roots, ...descriptor.descendants].map((id) => String(id));
    for (const id of ids) {
      this.forgotten.add(id);
    }
    return {
      abortEffects: [
        () => {
          for (const id of ids) {
            this.dropRuntime(this.committed, id);
          }
        },
      ],
      generationInvalidations: [],
    };
  }

  peekState(): RuleDraftState {
    return this.committed;
  }

  changedEffectivePaths(previous: RuleDraftState, next: RuleDraftState): InstancePath[] {
    const paths = new Set<string>();
    for (const path of new Set([...previous.schemaActive.keys(), ...next.schemaActive.keys()])) {
      if ((previous.schemaActive.get(path) !== false) !== (next.schemaActive.get(path) !== false)) {
        paths.add(path);
      }
    }
    for (const path of new Set([...previous.combined.keys(), ...next.combined.keys()])) {
      if (!sameAspects(previous.combined.get(path), next.combined.get(path))) {
        paths.add(path);
      }
    }
    return [...paths] as InstancePath[];
  }

  snapshot(): RuleDraftState {
    return cloneState(this.committed);
  }

  commit(state: RuleDraftState): void {
    this.committed = cloneState(state);
    this.forgotten.clear();
  }

  schemaEffectiveActive(path: InstancePath, state: RuleDraftState = this.committed): boolean {
    if (path === ROOT_INSTANCE_PATH) {
      return true;
    }
    const own = state.schemaActive.get(path);
    const schema = own !== false;
    const rule = state.combined.get(path)?.active !== false;
    for (const ancestor of instancePathAncestors(path)) {
      if (ancestor === ROOT_INSTANCE_PATH) {
        continue;
      }
      if (state.schemaActive.get(ancestor) === false) {
        return false;
      }
      if (state.combined.get(ancestor)?.active === false) {
        return false;
      }
    }
    return schema && rule;
  }

  effective(path: InstancePath, draft: TransactionDraft, state: RuleDraftState = this.committed): EffectiveState {
    const segments = parseInstancePath(path) ?? [];
    let current: EffectiveState = DEFAULT_EFFECTIVE;
    let prefix = ROOT_INSTANCE_PATH;
    current = this.effectiveAt(prefix, draft, state, undefined, true);
    for (const segment of segments) {
      prefix = joinInstancePath(prefix, segment);
      current = this.effectiveAt(prefix, draft, state, current, false);
    }
    return current;
  }

  activate(draft: TransactionDraft, state: RuleDraftState): void {
    this.forgetDraft(draft, state);
    const previous = new Map(state.schemaActive);
    state.schemaActive = new Map();
    state.oneOfDiagnostics = [];
    for (const record of draft.bindings.records.values()) {
      const path = draft.bindings.pathOf(record.runtimeId);
      if (path !== undefined) {
        state.schemaActive.set(path, true);
      }
    }
    state.schemaActive.set(ROOT_INSTANCE_PATH, true);

    for (const plan of this.model.schemaDynamics.plans) {
      const owners = this.bindingsForModelPath(draft, plan.ownerPath);
      for (const owner of owners) {
        const ownerPath = draft.bindings.pathOf(owner.runtimeId);
        if (ownerPath === undefined) {
          continue;
        }
        const matches: boolean[] = plan.branches.map((branch) =>
          evaluateActivationPredicate(branch.predicate, draft.values, plan.ownerPath, ownerPath),
        );
        if (plan.kind === "oneOf") {
          const count = matches.filter(Boolean).length;
          if (count !== 1) {
            state.oneOfDiagnostics.push(
              runtimeDiagnostic({
                code: RUNTIME_DIAGNOSTIC_CODES.ONEOF_AMBIGUOUS,
                severity: "warning",
                message: "oneOf matched zero or multiple branches",
                metadata: { ownerPath, matches: count, planId: plan.id },
              }),
            );
          }
          plan.branches.forEach((branch, index) => {
            const selected = count === 1 && matches[index] === true;
            this.applyBranch(draft, state, plan.ownerPath, ownerPath, branch, selected);
          });
        } else {
          plan.branches.forEach((branch, index) => {
            this.applyBranch(draft, state, plan.ownerPath, ownerPath, branch, matches[index] === true);
          });
        }
      }
    }

    if (!mapsEqualBool(previous, state.schemaActive)) {
      state.derivedChanged = true;
    }
  }

  runRules(
    draft: TransactionDraft,
    state: RuleDraftState,
    changePaths: readonly InstancePath[],
    enqueue: (command: RuntimeCommand) => void,
    all: boolean,
  ): void {
    this.forgetDraft(draft, state);
    const scheduled = all ? this.allInstances(draft) : this.schedule(draft, changePaths, state);
    this.stats.scheduledRules += scheduled.size;
    const stateRules: string[] = [];
    const computed: string[] = [];
    const effects: string[] = [];
    const validations: string[] = [];
    for (const key of scheduled) {
      const parsed = splitKey(key);
      const rule = this.rulesById.get(parsed.ruleId);
      if (rule === undefined) {
        continue;
      }
      if (rule.kind === "state") {
        stateRules.push(key);
      } else if (rule.kind === "computed") {
        computed.push(key);
      } else if (rule.kind === "effect") {
        effects.push(key);
      } else {
        validations.push(key);
      }
    }

    for (const key of stateRules) {
      this.evalState(draft, state, key);
    }
    this.recombine(draft, state, stateRules);

    const computedKeys = this.orderComputed(computed);
    const seen = new Set(computedKeys);
    for (const key of computedKeys) {
      this.evalComputed(draft, state, key, enqueue);
      this.expandComputed(draft, key, seen, computedKeys);
    }

    for (const key of effects) {
      this.evalEffect(draft, state, key, enqueue);
    }

    state.validationBindings = [];
    for (const key of validations) {
      const binding = this.evalValidation(draft, state, key);
      if (binding !== undefined) {
        state.validationBindings.push(binding);
      }
    }
  }

  validationPlan(state: RuleDraftState): AffectedValidationRulePlan {
    return { bindings: Object.freeze([...state.validationBindings]) };
  }

  serialize(
    draft: TransactionDraft,
    state: RuleDraftState,
    options: SerializeOptions | undefined,
    version: number,
  ): JsonValue {
    const plan = this.model.rule.serialization;
    const includeInactive = options?.includeInactive ?? plan.serializeInactive;
    const serializerKey = options?.serializer ?? plan.serializer;
    const pruned = pruneInactiveValues(draft.values, (path) => this.effective(path, draft, state).active, includeInactive);
    const frozen = cloneJsonValue(pruned);
    if (serializerKey === undefined) {
      return frozen;
    }
    const provider = this.environment.serializers.get(serializerKey);
    if (provider === undefined) {
      throw new FormRuntimeError(
        sortRuntimeDiagnostics([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.SERIALIZER_UNKNOWN,
            message: `Serializer "${serializerKey}" is not registered`,
            metadata: { serializer: serializerKey },
          }),
        ]),
      );
    }
    let output: unknown;
    try {
      output = provider.serialize(frozen, Object.freeze({ version, includeInactive }));
    } catch {
      throw new FormRuntimeError(
        sortRuntimeDiagnostics([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.SERIALIZER_FAILED,
            message: `Serializer "${serializerKey}" failed`,
            metadata: { serializer: serializerKey },
          }),
        ]),
      );
    }
    if (isThenable(output)) {
      throw new FormRuntimeError(
        sortRuntimeDiagnostics([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.SERIALIZER_FAILED,
            message: `Serializer "${serializerKey}" returned a thenable`,
            metadata: { serializer: serializerKey },
          }),
        ]),
      );
    }
    try {
      return cloneJsonValue(output);
    } catch (error) {
      const reason = error instanceof JsonCloneError ? error.reason : "non-json";
      throw new FormRuntimeError(
        sortRuntimeDiagnostics([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.SERIALIZER_FAILED,
            message: `Serializer "${serializerKey}" returned a non-JSON result`,
            metadata: { serializer: serializerKey, reason },
          }),
        ]),
      );
    }
  }

  private effectiveAt(
    path: InstancePath,
    draft: TransactionDraft,
    state: RuleDraftState,
    parent: EffectiveState | undefined,
    isRoot: boolean,
  ): EffectiveState {
    const binding = draft.bindings.records.get(draft.bindings.idAt(path) as RuntimeNodeId);
    const modelPath = binding?.modelPath ?? ROOT_MODEL_PATH;
    const field = this.model.ui.fields.get(modelPath);
    const behavior = field?.behavior ?? {};
    const combined = state.combined.get(path);
    return combineEffectiveState({
      parent,
      schemaActive: isRoot ? true : state.schemaActive.get(path) !== false,
      uiVisible: behavior.visible !== false,
      uiDisabled: behavior.disabled === true,
      uiReadonly: behavior.readonly === true,
      ruleActive: combined?.active !== false,
      ruleVisible: combined?.visible !== false,
      ruleDisabled: combined?.disabled === true,
      ruleReadonly: combined?.readonly === true,
      computedTarget: this.computedTargets.has(modelPath),
      isRoot,
    });
  }

  private applyBranch(
    draft: TransactionDraft,
    state: RuleDraftState,
    ownerTemplate: ModelPath,
    ownerInstance: InstancePath,
    branch: { readonly exclusiveNodes: readonly ModelPath[]; readonly sharedNodes: readonly ModelPath[] },
    selected: boolean,
  ): void {
    for (const node of branch.exclusiveNodes) {
      const instance = bindTemplatePath(node, ownerTemplate, ownerInstance);
      if (!selected) {
        state.schemaActive.set(instance, false);
      }
    }
    if (selected) {
      for (const node of [...branch.exclusiveNodes, ...branch.sharedNodes]) {
        const instance = bindTemplatePath(node, ownerTemplate, ownerInstance);
        if (state.schemaActive.get(instance) !== false) {
          state.schemaActive.set(instance, true);
        }
      }
    }
  }

  private schedule(draft: TransactionDraft, changePaths: readonly InstancePath[], state: RuleDraftState): Set<string> {
    const scheduled = new Set<string>();
    const modelPaths = new Map<string, ModelPath>();
    for (const path of changePaths) {
      const id = draft.bindings.idAt(path);
      const record = id === undefined ? undefined : draft.bindings.records.get(id);
      if (record !== undefined) {
        modelPaths.set(path, record.modelPath);
      }
    }
    for (const [instancePath, modelPath] of modelPaths) {
      const ruleIds = new Set<string>(this.model.rule.byPath.get(modelPath) ?? []);
      for (const rule of this.model.rule.rules) {
        if (rule.target === modelPath || isModelDescendant(rule.target, modelPath)) {
          ruleIds.add(rule.id);
        }
      }
      for (const ruleId of ruleIds) {
        const rule = this.rulesById.get(ruleId);
        if (rule === undefined) {
          continue;
        }
        if (modelPathListCount(modelPath) < modelPathListCount(rule.target)) {
          for (const record of draft.bindings.records.values()) {
            if (record.modelPath === rule.target) {
              scheduled.add(instanceKey(rule.id, record.runtimeId));
            }
          }
        } else {
          const targetInstance = bindTemplatePath(rule.target, modelPath, instancePath as InstancePath);
          const targetId = draft.bindings.idAt(targetInstance);
          if (targetId !== undefined) {
            scheduled.add(instanceKey(rule.id, targetId));
          }
        }
      }
    }
    for (const plan of this.model.schemaDynamics.plans) {
      void plan;
      void state;
    }
    this.scheduleInactiveControl(draft, scheduled);
    return scheduled;
  }

  private scheduleInactiveControl(draft: TransactionDraft, scheduled: Set<string>): void {
    for (const rule of this.model.rule.rules) {
      if (rule.kind !== "state" || rule.action.kind !== "state" || rule.action.aspects.active === undefined) {
        continue;
      }
      for (const record of draft.bindings.records.values()) {
        if (record.modelPath === rule.target) {
          scheduled.add(instanceKey(rule.id, record.runtimeId));
        }
      }
    }
  }

  private allInstances(draft: TransactionDraft): Set<string> {
    const scheduled = new Set<string>();
    for (const rule of this.model.rule.rules) {
      const target = rule.target;
      let found = false;
      for (const record of draft.bindings.records.values()) {
        if (record.modelPath === target) {
          scheduled.add(instanceKey(rule.id, record.runtimeId));
          found = true;
        }
      }
      if (!found && (target === ROOT_MODEL_PATH || rule.kind === "effect")) {
        const rootId = draft.bindings.idAt(ROOT_INSTANCE_PATH);
        if (rootId !== undefined) {
          scheduled.add(instanceKey(rule.id, rootId));
        }
      }
    }
    return scheduled;
  }

  private evalState(draft: TransactionDraft, state: RuleDraftState, key: string): void {
    const { rule, targetPath } = this.context(draft, key);
    if (rule.action.kind !== "state" || targetPath === undefined) {
      return;
    }
    if (!this.schemaEligible(draft, state, targetPath)) {
      return;
    }
    this.stats.evaluatedRules += 1;
    if (!this.whenAllows(rule, draft, targetPath)) {
      state.instanceResults.set(key, {});
      state.derivedChanged = true;
      return;
    }
    const aspects: Partial<Record<StateRuleAspect, boolean>> = {};
    for (const aspect of ASPECTS) {
      const expression = rule.action.aspects[aspect];
      if (expression === undefined) {
        continue;
      }
      const value = evaluateRuleExpression(expression, draft.values, {
        targetTemplate: rule.target,
        targetInstance: targetPath,
      }, this.environment);
      if (typeof value !== "boolean") {
        throw invalidResult("State rule must evaluate to a boolean");
      }
      aspects[aspect] = value;
    }
    const previous = state.instanceResults.get(key);
    state.instanceResults.set(key, aspects);
    if (!sameAspects(previous, aspects)) {
      state.derivedChanged = true;
    }
  }

  private evalComputed(
    draft: TransactionDraft,
    state: RuleDraftState,
    key: string,
    enqueue: (command: RuntimeCommand) => void,
  ): void {
    const { rule, targetPath } = this.context(draft, key);
    if (rule.action.kind !== "computed" || targetPath === undefined) {
      return;
    }
    if (!this.effectiveWorkAllowed(draft, state, targetPath)) {
      return;
    }
    if (!this.whenAllows(rule, draft, targetPath)) {
      return;
    }
    const value = evaluateRuleExpression(rule.action.value, draft.values, {
      targetTemplate: rule.target,
      targetInstance: targetPath,
    }, this.environment);
    if (jsonEqual(getJsonAt(draft.values, parseInstancePath(targetPath) ?? []), value)) {
      return;
    }
    this.stats.evaluatedRules += 1;
    enqueue({ type: "setValue", path: targetPath, value });
  }

  private evalEffect(
    draft: TransactionDraft,
    state: RuleDraftState,
    key: string,
    enqueue: (command: RuntimeCommand) => void,
  ): void {
    const { rule, targetPath } = this.context(draft, key);
    if (rule.action.kind !== "effect" || targetPath === undefined) {
      return;
    }
    if (!this.effectiveWorkAllowed(draft, state, targetPath)) {
      return;
    }
    if (!this.whenAllows(rule, draft, targetPath)) {
      return;
    }
    let wrote = false;
    for (const action of rule.action.actions) {
      const path = bindTemplatePath(action.target, rule.target, targetPath);
      const value = evaluateRuleExpression(action.value, draft.values, {
        targetTemplate: rule.target,
        targetInstance: targetPath,
      }, this.environment);
      if (jsonEqual(getJsonAt(draft.values, parseInstancePath(path) ?? []), value)) {
        continue;
      }
      wrote = true;
      enqueue({ type: "setValue", path, value });
    }
    if (wrote) {
      this.stats.evaluatedRules += 1;
    }
  }

  private evalValidation(
    draft: TransactionDraft,
    state: RuleDraftState,
    key: string,
  ): AffectedValidationRuleBinding | undefined {
    const { rule, targetPath } = this.context(draft, key);
    if (rule.kind !== "validation" || targetPath === undefined) {
      return undefined;
    }
    if (!this.effectiveWorkAllowed(draft, state, targetPath)) {
      return undefined;
    }
    if (!this.whenAllows(rule, draft, targetPath)) {
      return undefined;
    }
    this.stats.evaluatedRules += 1;
    return { ruleId: rule.id, target: targetPath };
  }

  private expandComputed(draft: TransactionDraft, producerKey: string, seen: Set<string>, list: string[]): void {
    const { rule, targetPath } = this.context(draft, producerKey);
    if (rule.kind !== "computed" || targetPath === undefined) {
      return;
    }
    for (const consumer of this.model.rule.rules) {
      if (consumer.kind !== "computed" || !consumer.dependencies.includes(rule.target)) {
        continue;
      }
      const instance = bindTemplatePath(consumer.target, rule.target, targetPath);
      const id = draft.bindings.idAt(instance);
      if (id === undefined) {
        continue;
      }
      const key = instanceKey(consumer.id, id);
      if (!seen.has(key)) {
        seen.add(key);
        list.push(key);
      }
    }
  }

  private orderComputed(keys: readonly string[]): string[] {
    const index = new Map(this.model.rule.computedOrder.map((id, position) => [id, position]));
    return [...keys].sort((left, right) => {
      const l = index.get(splitKey(left).ruleId) ?? 9999;
      const r = index.get(splitKey(right).ruleId) ?? 9999;
      if (l !== r) {
        return l - r;
      }
      return left < right ? -1 : 1;
    });
  }

  private recombine(draft: TransactionDraft, state: RuleDraftState, updatedKeys: readonly string[]): void {
    const paths = new Set<string>();
    for (const key of updatedKeys) {
      const { targetPath } = this.context(draft, key);
      if (targetPath !== undefined) {
        paths.add(targetPath);
      }
    }
    for (const path of paths) {
      const combined: Partial<Record<StateRuleAspect, boolean>> = {};
      let active = true;
      let visible = true;
      let disabled = false;
      let readonly = false;
      for (const [key, result] of state.instanceResults) {
        const ctx = this.context(draft, key);
        if (ctx.targetPath !== path || ctx.rule.kind !== "state") {
          continue;
        }
        if (result.active === false) {
          active = false;
        }
        if (result.visible === false) {
          visible = false;
        }
        if (result.disabled === true) {
          disabled = true;
        }
        if (result.readonly === true) {
          readonly = true;
        }
      }
      combined.active = active;
      combined.visible = visible;
      combined.disabled = disabled;
      combined.readonly = readonly;
      state.combined.set(path, combined);
    }
  }

  private whenAllows(rule: CompiledRule, draft: TransactionDraft, targetPath: InstancePath): boolean {
    if (rule.when === undefined) {
      return true;
    }
    const value = evaluateRuleExpression(rule.when, draft.values, {
      targetTemplate: rule.target,
      targetInstance: targetPath,
    }, this.environment);
    if (typeof value !== "boolean") {
      throw invalidResult("Rule when expression must evaluate to a boolean");
    }
    return value;
  }

  private schemaEligible(draft: TransactionDraft, state: RuleDraftState, path: InstancePath): boolean {
    if (path === ROOT_INSTANCE_PATH) {
      return true;
    }
    if (state.schemaActive.get(path) === false) {
      return false;
    }
    for (const ancestor of instancePathAncestors(path)) {
      if (ancestor !== ROOT_INSTANCE_PATH && state.schemaActive.get(ancestor) === false) {
        return false;
      }
    }
    void draft;
    return true;
  }

  private effectiveWorkAllowed(draft: TransactionDraft, state: RuleDraftState, path: InstancePath): boolean {
    return this.schemaEligible(draft, state, path) && this.schemaEffectiveActive(path, state);
  }

  private context(draft: TransactionDraft, key: string): { rule: CompiledRule; targetPath: InstancePath | undefined } {
    const parsed = splitKey(key);
    const rule = this.rulesById.get(parsed.ruleId);
    if (rule === undefined) {
      throw invalidResult("Unknown compiled rule");
    }
    const targetPath = draft.bindings.pathOf(parsed.runtimeId as RuntimeNodeId);
    return { rule, targetPath };
  }

  private bindingsForModelPath(draft: TransactionDraft, modelPath: ModelPath) {
    const matches = [];
    for (const record of draft.bindings.records.values()) {
      if (record.modelPath === modelPath) {
        matches.push(record);
      }
    }
    if (matches.length === 0 && modelPath === ROOT_MODEL_PATH) {
      const root = draft.bindings.idAt(ROOT_INSTANCE_PATH);
      if (root !== undefined) {
        const record = draft.bindings.records.get(root);
        if (record !== undefined) {
          matches.push(record);
        }
      }
    }
    return matches;
  }

  private forgetDraft(draft: TransactionDraft, state: RuleDraftState): void {
    for (const id of draft.removedRuntimeIds) {
      this.dropRuntime(state, String(id));
    }
    for (const id of this.forgotten) {
      this.dropRuntime(state, id);
    }
  }

  private dropRuntime(state: RuleDraftState, runtimeId: string): void {
    for (const key of [...state.instanceResults.keys()]) {
      if (splitKey(key).runtimeId === runtimeId) {
        state.instanceResults.delete(key);
      }
    }
  }
}

function emptyState(): RuleDraftState {
  return {
    schemaActive: new Map(),
    combined: new Map(),
    instanceResults: new Map(),
    derivedChanged: false,
    validationBindings: [],
    oneOfDiagnostics: [],
  };
}

function cloneState(state: RuleDraftState): RuleDraftState {
  return {
    schemaActive: new Map(state.schemaActive),
    combined: new Map(state.combined),
    instanceResults: new Map(state.instanceResults),
    derivedChanged: false,
    validationBindings: [...state.validationBindings],
    oneOfDiagnostics: [...state.oneOfDiagnostics],
  };
}

function instanceKey(ruleId: string, runtimeId: RuntimeNodeId | string): string {
  return `${ruleId}::${String(runtimeId)}`;
}

function splitKey(key: string): { ruleId: string; runtimeId: string } {
  const index = key.indexOf("::");
  return { ruleId: key.slice(0, index), runtimeId: key.slice(index + 2) };
}

function isModelDescendant(path: ModelPath, ancestor: ModelPath): boolean {
  if (ancestor === ROOT_MODEL_PATH) {
    return false;
  }
  return path.startsWith(`${ancestor}.`) || path.startsWith(`${ancestor}[`);
}

function mapsEqualBool(left: Map<string, boolean>, right: Map<string, boolean>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left) {
    if (right.get(key) !== value) {
      return false;
    }
  }
  return true;
}

function sameAspects(
  left: Partial<Record<StateRuleAspect, boolean>> | undefined,
  right: Partial<Record<StateRuleAspect, boolean>> | undefined,
): boolean {
  for (const aspect of ASPECTS) {
    if (aspectValue(left, aspect) !== aspectValue(right, aspect)) {
      return false;
    }
  }
  return true;
}

function aspectValue(
  record: Partial<Record<StateRuleAspect, boolean>> | undefined,
  aspect: StateRuleAspect,
): boolean {
  const value = record?.[aspect];
  if (value !== undefined) {
    return value;
  }
  return aspect === "active" || aspect === "visible";
}

function invalidResult(message: string): FormRuntimeError {
  return new FormRuntimeError(
    sortRuntimeDiagnostics([
      runtimeDiagnostic({
        code: RUNTIME_DIAGNOSTIC_CODES.RULE_RESULT_INVALID,
        message,
      }),
    ]),
  );
}

function isThenable(value: unknown): boolean {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
