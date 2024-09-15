import type { Diagnostic } from "../../diagnostic/index.js";
import { freezeDiagnostic } from "../../diagnostic/freeze.js";
import type { JsonValue } from "../../definition/json-value.js";
import type { ValidationTrigger } from "../../definition/form-config.js";
import type {
  AsyncValidatorDefinition,
  CustomValidatorContext,
  SchemaAdapterDefinition,
  SyncValidatorDefinition,
  ValidatorAbortSignal,
} from "../../extension/contributions.js";
import type { NamedValidationPlan, ValidationRulePlan } from "../../model/validation/validation.js";
import {
  ROOT_INSTANCE_PATH,
  asInstancePath,
  instancePathAncestors,
  instancePathStartsWith,
  parseInstancePath,
  toInstancePath,
  type InstancePath,
  type ModelPath,
} from "../../model/path/index.js";
import { bindTemplatePath } from "../../model/path/bind-path.js";
import type {
  ApplyErrorsOptions,
  ServerErrorInput,
  SubmitResult,
  ValidationError,
  ValidationResult,
} from "../../validation/error.js";
import type { TransactionDraft } from "../transaction/commands.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import { runtimeDiagnostic } from "../diagnostics.js";
import { FormRuntimeError } from "../error.js";
import { cloneJsonValue, getJsonAt, JsonCloneError } from "../value/json-value.js";
import type { NormalizedChangeSet } from "../transaction/phases.js";
import type { RuntimeNodeId } from "../form/runtime-node-id.js";
import type { RuntimeSubtreeOwner, SubtreeCleanupPlan, SubtreeDescriptor } from "../form/subtree-lifecycle.js";
import type { AffectedValidationRulePlan } from "../rule/engine.js";
import { evaluateRuleExpression } from "../../rule/evaluator.js";
import {
  asOptionalSchemaPath,
  cloneIssueParams,
  customIssuesFromUnknown,
  EMPTY_ERRORS,
  readMissingProperty,
  schemaIssuesFromUnknown,
  sortErrors,
  toValidationError,
  type NormalizedIssue,
} from "./errors.js";
import type { ValidationHost } from "./host.js";
import { instancePathToJsonPointer, resolveJsonPointerBinding } from "./pointer.js";
import { ErrorStore, type OwnerEntry } from "./store.js";

class MiniAbort implements ValidatorAbortSignal {
  aborted = false;
  reason: unknown;
  abort(reason?: unknown): void {
    this.aborted = true;
    this.reason = reason;
  }
}

interface PendingRun {
  readonly key: string;
  readonly generation: number;
  readonly attempt: number;
  readonly runtimeId: RuntimeNodeId;
  readonly abort: MiniAbort;
  settled: boolean;
}

const SCHEMA_OWNER = "schema:global";

export class ValidationEngine implements RuntimeSubtreeOwner {
  readonly name = "validation";
  readonly store = new ErrorStore();
  submitCount = 0;
  activeSubmits = 0;
  revision = 1;
  private readonly pending = new Map<string, PendingRun>();
  private readonly validatingKeys = new Set<string>();
  private readonly planOrder = new Map<string, number>();
  private readonly aggregateCache = new Map<string, readonly ValidationError[]>();
  private attempt = 0;
  private waiters: Array<() => void> = [];

  constructor(private readonly host: ValidationHost) {
    let order = 0;
    this.planOrder.set("schema", ++order);
    for (const plan of host.model.validation.custom) {
      this.planOrder.set(plan.id, ++order);
    }
    for (const plan of host.model.validation.async) {
      this.planOrder.set(plan.id, ++order);
    }
    for (const plan of host.model.validation.rules) {
      this.planOrder.set(plan.id, ++order);
      this.planOrder.set(plan.ruleId, order);
    }
  }

  get submitting(): boolean {
    return this.activeSubmits > 0;
  }

  hasLifecycleState(): boolean {
    return (
      this.submitCount !== 0 ||
      this.activeSubmits !== 0 ||
      this.pending.size > 0 ||
      this.validatingKeys.size > 0 ||
      this.store.owners.size > 0
    );
  }

  plan(descriptor: SubtreeDescriptor): SubtreeCleanupPlan {
    const ids = new Set([...descriptor.roots, ...descriptor.descendants]);
    return {
      abortEffects: [() => this.invalidateSubtree(ids)],
      generationInvalidations: [...this.pending.keys()].filter((key) => {
        const run = this.pending.get(key);
        return run !== undefined && ids.has(run.runtimeId);
      }),
    };
  }

  resetLifecycle(): boolean {
    for (const run of this.pending.values()) {
      run.abort.abort("reset");
    }
    this.pending.clear();
    this.validatingKeys.clear();
    const changed = this.store.clear() || this.submitCount !== 0 || this.activeSubmits !== 0;
    this.submitCount = 0;
    this.activeSubmits = 0;
    if (changed) {
      this.revision += 1;
    }
    this.flushWaiters();
    return changed;
  }

  sync(
    draft: TransactionDraft,
    changeSet: NormalizedChangeSet,
    intent: ValidationTrigger | undefined,
    rulePlan: AffectedValidationRulePlan | undefined,
  ): boolean {
    this.refreshOrder(draft);
    const trigger = intent ?? inferTrigger(changeSet, this.host.model.validation.validateOn);
    let changed = draft.reset ? this.resetLifecycle() : this.clearServerOnChange(draft, changeSet);
    if (trigger === undefined) {
      changed = this.runRules(draft, rulePlan, changeSet, "change") || changed;
      if (changed) {
        this.revision += 1;
      }
      return changed;
    }
    const runAll = trigger === "manual" || trigger === "submit";
    if (runAll || this.host.model.validation.validateOn === trigger) {
      if (!this.host.model.validation.schema.unbound || runAll) {
        changed = this.runSchema(draft, changeSet, trigger) || changed;
      }
    }
    for (const plan of this.host.model.validation.custom) {
      for (const record of draft.bindings.records.values()) {
        if (record.modelPath !== plan.target) {
          continue;
        }
        const ownerKey = `custom:${plan.id}:${record.runtimeId}`;
        if (!this.eligible(draft, record.runtimeId)) {
          changed = this.store.removeOwner(ownerKey) || changed;
          continue;
        }
        if (!runAll && !plan.triggers.includes(trigger)) {
          continue;
        }
        if (runAll || this.affected(plan, record.runtimeId, draft, changeSet, trigger)) {
          changed = this.runCustom(draft, plan, record.runtimeId) || changed;
        }
      }
    }
    for (const plan of this.host.model.validation.async) {
      for (const record of draft.bindings.records.values()) {
        if (record.modelPath !== plan.target) {
          continue;
        }
        if (!this.eligible(draft, record.runtimeId)) {
          const ownerKey = `async:${plan.id}:${record.runtimeId}`;
          changed = this.store.removeOwner(ownerKey) || changed;
          const run = this.pending.get(ownerKey);
          if (run !== undefined) {
            run.abort.abort("inactive");
            this.pending.delete(ownerKey);
            this.validatingKeys.delete(ownerKey);
            changed = true;
          }
        }
      }
    }
    changed = this.runRules(draft, rulePlan, changeSet, trigger) || changed;
    if (changed) {
      this.revision += 1;
    }
    return changed;
  }

  collectAsync(
    draft: TransactionDraft,
    changeSet: NormalizedChangeSet,
    intent: ValidationTrigger | undefined,
  ): Array<{ plan: NamedValidationPlan; runtimeId: RuntimeNodeId }> {
    const trigger = intent ?? inferTrigger(changeSet, this.host.model.validation.validateOn);
    if (trigger === undefined) {
      return [];
    }
    const runAll = trigger === "manual" || trigger === "submit";
    const jobs: Array<{ plan: NamedValidationPlan; runtimeId: RuntimeNodeId }> = [];
    for (const plan of this.host.model.validation.async) {
      if (!runAll && !plan.triggers.includes(trigger)) {
        continue;
      }
      for (const runtimeId of this.bindingsFor(draft, plan, changeSet, trigger)) {
        if (this.eligible(draft, runtimeId)) {
          jobs.push({ plan, runtimeId });
        }
      }
    }
    return jobs;
  }

  startAsync(
    draft: TransactionDraft,
    jobs: readonly { plan: NamedValidationPlan; runtimeId: RuntimeNodeId }[],
    attempt: number,
  ): void {
    for (const job of jobs) {
      this.launchAsync(draft, job.plan, job.runtimeId, attempt);
    }
  }

  beginAttempt(): number {
    this.attempt += 1;
    return this.attempt;
  }

  waitForAttempt(attempt: number, version: number): Promise<void> {
    return new Promise((resolve) => {
      const check = (): void => {
        if (this.host.mutationEpoch() !== version) {
          resolve();
          return;
        }
        if (![...this.pending.values()].some((run) => run.attempt === attempt && !run.settled)) {
          resolve();
          return;
        }
        this.waiters.push(check);
      };
      check();
    });
  }

  nodeSnapshot(runtimeId: RuntimeNodeId | undefined, aggregate: boolean): {
    readonly directErrors: readonly ValidationError[];
    readonly errors: readonly ValidationError[];
    readonly valid: boolean;
    readonly validating: boolean;
  } {
    const direct = this.project(this.store.directErrors(runtimeId));
    const errors = aggregate ? this.project(this.collectAggregate(runtimeId)) : direct;
    return {
      directErrors: direct,
      errors,
      valid: errors.length === 0,
      validating: this.isValidating(runtimeId, aggregate),
    };
  }

  formSnapshot() {
    const root = this.host.bindings().idAt(ROOT_INSTANCE_PATH);
    return {
      ...this.nodeSnapshot(root, true),
      submitting: this.submitting,
      submitCount: this.submitCount,
    };
  }

  presentable(errors: readonly ValidationError[], path: InstancePath): readonly ValidationError[] {
    const policy = this.host.model.validation.presentation.policy;
    const touched = this.host.isTouched(path);
    const submitted = this.submitCount > 0;
    const show =
      policy === "always" ||
      (policy === "touched" && touched) ||
      (policy === "submitted" && submitted) ||
      (policy === "touched-or-submitted" && (touched || submitted));
    return show ? errors : EMPTY_ERRORS;
  }

  applyErrors(input: readonly ServerErrorInput[], options?: ApplyErrorsOptions): boolean {
    let cloned: unknown;
    try {
      cloned = cloneJsonValue(input);
    } catch {
      this.host.fail([applyDiag("applyErrors() input must be JSON-compatible")]);
    }
    if (!Array.isArray(cloned)) {
      this.host.fail([applyDiag("applyErrors() expects an array")]);
    }
    const preserve = options?.preserveOnChange === true || this.host.model.validation.server.preserveOnChange;
    if (cloned.length === 0) {
      const changed = this.store.removeWhere((record) => record.source === "server");
      if (changed) {
        this.revision += 1;
      }
      return changed;
    }
    const bindings = this.host.bindings();
    const grouped = new Map<RuntimeNodeId, OwnerEntry[]>();
    cloned.forEach((item, ordinal) => {
      if (!isPlain(item)) {
        this.host.fail([applyDiag("Server error must be a plain object")]);
      }
      if (item.source !== undefined && item.source !== "server") {
        this.host.fail([applyDiag("applyErrors() cannot impersonate a non-server source")]);
      }
      if (typeof item.code !== "string" || item.code.length === 0) {
        this.host.fail([applyDiag("Server error is missing a code")]);
      }
      const path = toInstancePath(String(item.instancePath ?? ""));
      const runtimeId = path === undefined ? undefined : bindings.idAt(path);
      if (path === undefined || runtimeId === undefined) {
        this.host.fail([
          applyDiag("Server error target is not a current DataNode", { path: String(item.instancePath) }),
        ]);
      }
      const record = bindings.records.get(runtimeId);
      let params: JsonValue | undefined;
      try {
        params = cloneIssueParams(item.params);
      } catch {
        this.host.fail([applyDiag("Server error params must be JSON-compatible")]);
      }
      const issue: NormalizedIssue = {
        code: item.code,
        instancePath: path,
        source: "server",
        ownerKey: `server:${runtimeId}`,
        ordinal,
        ...(record?.modelPath === undefined ? {} : { modelPath: record.modelPath }),
        ...(typeof item.message === "string" ? { message: item.message } : {}),
        ...(params === undefined ? {} : { params }),
      };
      const list = grouped.get(runtimeId) ?? [];
      list.push({ runtimeId, error: toValidationError(issue) });
      grouped.set(runtimeId, list);
    });
    this.store.removeWhere((record) => record.source === "server");
    let changed = false;
    for (const [runtimeId, entries] of grouped) {
      changed =
        this.store.replaceOwner({
          key: `server:${runtimeId}`,
          source: "server",
          preserveOnChange: preserve,
          entries,
        }) || changed;
    }
    if (changed) {
      this.revision += 1;
    }
    return changed;
  }

  beginSubmit(): void {
    this.submitCount += 1;
    this.activeSubmits += 1;
    this.revision += 1;
  }

  endSubmit(): void {
    this.activeSubmits = Math.max(0, this.activeSubmits - 1);
    this.revision += 1;
  }

  result(version: number, superseded: boolean): ValidationResult {
    const errors = this.formSnapshot().errors;
    return Object.freeze({
      version,
      valid: !superseded && errors.length === 0,
      errors,
      superseded,
    });
  }

  submitResult(version: number, superseded: boolean, submitted: boolean, payload?: JsonValue): SubmitResult {
    return Object.freeze({
      ...this.result(version, superseded),
      submitted,
      ...(payload === undefined ? {} : { payload }),
    });
  }

  affectedFor(path: InstancePath): Set<string> {
    const keys = new Set<string>(["form", `validation:${path}`, `field:${path}`]);
    for (const ancestor of instancePathAncestors(path)) {
      keys.add(`validation:${ancestor}`);
      keys.add(`field:${ancestor}`);
    }
    return keys;
  }

  pendingRuntimeIds(): RuntimeNodeId[] {
    return [...this.pending.values()].filter((run) => !run.settled).map((run) => run.runtimeId);
  }

  selectorKeysForDirty(): Set<string> {
    const keys = new Set<string>(["form"]);
    for (const id of this.store.takeDirty()) {
      const path = this.host.bindings().pathOf(id);
      if (path !== undefined) {
        for (const key of this.affectedFor(path)) {
          keys.add(key);
        }
      }
    }
    return keys;
  }

  private refreshOrder(draft: TransactionDraft): void {
    const dataOrder = new Map<string, number>();
    let index = 0;
    for (const path of [...draft.bindings.pathToId.keys()].sort()) {
      dataOrder.set(path, index);
      index += 1;
    }
    this.store.setOrder(dataOrder, this.planOrder);
  }

  private eligible(draft: TransactionDraft, runtimeId: RuntimeNodeId): boolean {
    const path = draft.bindings.pathOf(runtimeId);
    return path !== undefined && this.host.isActive(path);
  }

  private bindingsFor(
    draft: TransactionDraft,
    plan: NamedValidationPlan | ValidationRulePlan,
    changeSet: NormalizedChangeSet,
    trigger: ValidationTrigger,
  ): RuntimeNodeId[] {
    const ids: RuntimeNodeId[] = [];
    for (const record of draft.bindings.records.values()) {
      if (record.modelPath !== plan.target) {
        continue;
      }
      if (trigger === "manual" || trigger === "submit" || this.affected(plan, record.runtimeId, draft, changeSet, trigger)) {
        ids.push(record.runtimeId);
      }
    }
    return ids;
  }

  private affected(
    plan: NamedValidationPlan | ValidationRulePlan,
    runtimeId: RuntimeNodeId,
    draft: TransactionDraft,
    changeSet: NormalizedChangeSet,
    trigger: ValidationTrigger,
  ): boolean {
    const targetPath = draft.bindings.pathOf(runtimeId);
    if (targetPath === undefined) {
      return false;
    }
    if (this.host.activationChanged(targetPath)) {
      return true;
    }
    const hits = (path: InstancePath): boolean =>
      path === targetPath ||
      instancePathStartsWith(path, targetPath) ||
      plan.dependencies.some((dependency) => {
        const bound = bindTemplatePath(dependency, plan.target, targetPath);
        return path === bound || instancePathStartsWith(path, bound);
      });
    if (trigger === "blur") {
      return changeSet.blurred.some((item) => hits(item.path));
    }
    return changeSet.valuePaths.some(hits);
  }

  private runSchema(draft: TransactionDraft, changeSet: NormalizedChangeSet, trigger: ValidationTrigger): boolean {
    const plan = this.host.model.validation.schema;
    if (plan.unbound || plan.adapterKey === undefined) {
      this.host.fail([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.SCHEMA_ADAPTER_UNBOUND,
          message: "Schema validation was requested without a bound Schema Validator Adapter",
        }),
      ]);
    }
    const descriptor = this.host.environment.validators.get(plan.adapterKey);
    if (descriptor === undefined || descriptor.kind !== "schema-adapter") {
      this.host.fail([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.SCHEMA_ADAPTER_UNBOUND,
          message: "Bound Schema Validator Adapter is not available",
          metadata: { adapter: plan.adapterKey },
        }),
      ]);
    }
    const adapter = descriptor as SchemaAdapterDefinition;
    const capabilities = adapter.capabilities;
    const useAffected = capabilities?.validateAffected === true && typeof adapter.validateAffected === "function";
    const useAt = capabilities?.validateAt === true && typeof adapter.validateAt === "function";
    const runAll = trigger === "manual" || trigger === "submit";
    const leaves = leafValuePaths(changeSet.valuePaths);
    let raw: unknown;
    try {
      if (!runAll && useAffected) {
        raw = adapter.validateAffected!({
          schema: plan.schema,
          value: draft.values,
          instancePaths: leaves.map(instancePathToJsonPointer),
        });
      } else if (!runAll && useAt && leaves.length === 1) {
        raw = adapter.validateAt!({
          schema: plan.schema,
          value: draft.values,
          instancePath: instancePathToJsonPointer(leaves[0]!),
        });
      } else {
        raw = adapter.validateAll({ schema: plan.schema, value: draft.values });
      }
    } catch {
      this.host.fail([adapterDiag("Schema adapter validation failed", { adapter: plan.adapterKey })]);
    }
    if (isThenable(raw)) {
      this.host.fail([adapterDiag("Schema adapter validateAll must be synchronous", { adapter: plan.adapterKey })]);
    }
    let issues;
    try {
      issues = schemaIssuesFromUnknown(raw);
    } catch {
      this.host.fail([adapterDiag("Schema adapter returned a malformed issue list", { adapter: plan.adapterKey })]);
    }
    const entries: OwnerEntry[] = [];
    for (let ordinal = 0; ordinal < issues.length; ordinal += 1) {
      const issue = issues[ordinal]!;
      const missing =
        issue.keyword === "required" || issue.code === "required" ? readMissingProperty(issue.params) : undefined;
      const binding = resolveJsonPointerBinding(issue.instancePath, draft.bindings, this.host.model, missing);
      if (binding === undefined) {
        this.host.fail([
          adapterDiag("Schema adapter issue could not be mapped to a DataNode", {
            adapter: plan.adapterKey,
            instancePath: issue.instancePath,
          }),
        ]);
      }
      if (!this.host.isActive(binding.path)) {
        continue;
      }
      let params: JsonValue | undefined;
      try {
        params = cloneIssueParams(issue.params);
      } catch {
        this.host.fail([adapterDiag("Schema adapter params must be JSON-compatible", { adapter: plan.adapterKey })]);
      }
      const schemaPath = asOptionalSchemaPath(issue.schemaPath);
      entries.push({
        runtimeId: binding.runtimeId,
        error: toValidationError({
          code: issue.code,
          instancePath: binding.path,
          modelPath: binding.record.modelPath,
          validatorId: plan.adapterKey,
          source: "schema",
          ownerKey: SCHEMA_OWNER,
          ordinal,
          ...(issue.message === undefined ? {} : { message: issue.message }),
          ...(issue.keyword === undefined ? {} : { keyword: issue.keyword }),
          ...(params === undefined ? {} : { params }),
          ...(schemaPath === undefined ? {} : { schemaPath }),
        }),
      });
    }
    return this.store.replaceOwner({
      key: SCHEMA_OWNER,
      source: "schema",
      preserveOnChange: false,
      entries,
    });
  }

  private runCustom(draft: TransactionDraft, plan: NamedValidationPlan, runtimeId: RuntimeNodeId): boolean {
    const descriptor = this.host.environment.validators.get(plan.key);
    if (descriptor === undefined || descriptor.kind !== "sync") {
      this.host.fail([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.VALIDATOR_FAILED,
          message: "Sync validator is not registered",
          metadata: { validator: plan.key },
        }),
      ]);
    }
    const path = draft.bindings.pathOf(runtimeId);
    const record = draft.bindings.records.get(runtimeId);
    if (path === undefined || record === undefined) {
      return false;
    }
    let raw: unknown;
    try {
      raw = (descriptor as SyncValidatorDefinition).validate(this.contextFor(draft, plan, path, record.modelPath));
    } catch {
      this.host.fail([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.VALIDATOR_FAILED,
          message: "Sync validator threw",
          metadata: { validator: plan.key },
        }),
      ]);
    }
    if (isThenable(raw)) {
      this.host.fail([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.VALIDATOR_INVALID_RESULT,
          message: "Sync validator returned a thenable",
          metadata: { validator: plan.key },
        }),
      ]);
    }
    return this.replaceIssues(draft, plan, runtimeId, path, record.modelPath, raw, "custom");
  }

  private runRules(
    draft: TransactionDraft,
    rulePlan: AffectedValidationRulePlan | undefined,
    changeSet: NormalizedChangeSet,
    trigger: ValidationTrigger,
  ): boolean {
    const runAll = trigger === "manual" || trigger === "submit";
    let changed = false;
    for (const plan of this.host.model.validation.rules) {
      const scheduled = new Set(
        (rulePlan?.bindings ?? [])
          .filter((binding) => binding.ruleId === plan.ruleId)
          .map((binding) => draft.bindings.idAt(binding.target))
          .filter((id): id is RuntimeNodeId => id !== undefined),
      );
      const compiled = this.host.model.rule.rules.find((item) => item.id === plan.ruleId);
      if (compiled === undefined || compiled.action.kind !== "validation") {
        this.host.fail([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.VALIDATOR_INVALID_RESULT,
            message: "Validation Rule metadata is invalid",
            metadata: { ruleId: plan.ruleId },
          }),
        ]);
      }
      for (const record of draft.bindings.records.values()) {
        if (record.modelPath !== plan.target) {
          continue;
        }
        const ownerKey = `rule:${plan.ruleId}:${record.runtimeId}`;
        if (!this.eligible(draft, record.runtimeId)) {
          changed = this.store.removeOwner(ownerKey) || changed;
          continue;
        }
        if (!runAll && !scheduled.has(record.runtimeId) && !this.affected(plan, record.runtimeId, draft, changeSet, trigger)) {
          continue;
        }
        const path = draft.bindings.pathOf(record.runtimeId);
        if (path === undefined) {
          continue;
        }
        let assertion: unknown;
        try {
          assertion = evaluateRuleExpression(
            compiled.action.assertion,
            draft.values,
            { targetTemplate: compiled.target, targetInstance: path },
            this.host.environment,
          );
        } catch (error) {
          if (error instanceof FormRuntimeError) {
            throw error;
          }
          this.host.fail([
            runtimeDiagnostic({
              code: RUNTIME_DIAGNOSTIC_CODES.VALIDATOR_FAILED,
              message: "Validation Rule assertion failed",
              metadata: { ruleId: plan.ruleId },
            }),
          ]);
        }
        if (isThenable(assertion) || typeof assertion !== "boolean") {
          this.host.fail([
            runtimeDiagnostic({
              code: RUNTIME_DIAGNOSTIC_CODES.VALIDATOR_INVALID_RESULT,
              message: "Validation Rule assertion must evaluate to a boolean",
              metadata: { ruleId: plan.ruleId },
            }),
          ]);
        }
        if (assertion) {
          changed = this.store.removeOwner(ownerKey) || changed;
          continue;
        }
        changed =
          this.store.replaceOwner({
            key: ownerKey,
            source: "custom",
            preserveOnChange: false,
            entries: [
              {
                runtimeId: record.runtimeId,
                error: toValidationError({
                  code: plan.code,
                  instancePath: path,
                  modelPath: record.modelPath,
                  message: plan.message,
                  validatorId: plan.ruleId,
                  source: "custom",
                  ownerKey,
                  ordinal: 0,
                  ...(plan.params === undefined ? {} : { params: plan.params }),
                }),
              },
            ],
          }) || changed;
      }
    }
    return changed;
  }

  private replaceIssues(
    draft: TransactionDraft,
    plan: NamedValidationPlan,
    runtimeId: RuntimeNodeId,
    path: InstancePath,
    modelPath: ModelPath,
    raw: unknown,
    source: "custom" | "async",
  ): boolean {
    let issues;
    try {
      issues = customIssuesFromUnknown(raw);
    } catch {
      this.host.fail([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.VALIDATOR_INVALID_RESULT,
          message: "Validator returned a malformed issue list",
          metadata: { validator: plan.key },
        }),
      ]);
    }
    const ownerKey = `${source}:${plan.id}:${runtimeId}`;
    const entries: OwnerEntry[] = [];
    for (let ordinal = 0; ordinal < issues.length; ordinal += 1) {
      const issue = issues[ordinal]!;
      const instancePath = issue.instancePath === undefined ? path : toInstancePath(issue.instancePath);
      if (instancePath === undefined) {
        this.host.fail([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.POINTER_UNMAPPABLE,
            message: "Validator issue path is not a current DataNode",
            metadata: { validator: plan.key },
          }),
        ]);
      }
      let params: JsonValue | undefined;
      try {
        params = cloneIssueParams(issue.params);
      } catch {
        this.host.fail([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.VALIDATOR_INVALID_RESULT,
            message: "Validator params must be JSON-compatible",
            metadata: { validator: plan.key },
          }),
        ]);
      }
      entries.push({
        runtimeId: draft.bindings.idAt(instancePath) ?? runtimeId,
        error: toValidationError({
          code: issue.code,
          instancePath,
          modelPath,
          validatorId: plan.key,
          source,
          ownerKey,
          ordinal,
          ...(issue.message === undefined ? {} : { message: issue.message }),
          ...(params === undefined ? {} : { params }),
        }),
      });
    }
    return this.store.replaceOwner({
      key: ownerKey,
      source,
      preserveOnChange: false,
      entries,
    });
  }

  private launchAsync(
    draft: TransactionDraft,
    plan: NamedValidationPlan,
    runtimeId: RuntimeNodeId,
    attempt: number,
  ): void {
    const descriptor = this.host.environment.validators.get(plan.key);
    if (descriptor === undefined || descriptor.kind !== "async") {
      this.host.emit([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.VALIDATOR_FAILED,
          severity: "warning",
          message: "Async validator is not registered",
          metadata: { validator: plan.key },
        }),
      ]);
      return;
    }
    const key = `async:${plan.id}:${runtimeId}`;
    const previous = this.pending.get(key);
    previous?.abort.abort("superseded");
    const generation = (previous?.generation ?? 0) + 1;
    const abort = new MiniAbort();
    this.pending.set(key, { key, generation, attempt, runtimeId, abort, settled: false });
    this.validatingKeys.add(key);
    const path = draft.bindings.pathOf(runtimeId);
    const record = draft.bindings.records.get(runtimeId);
    if (path === undefined || record === undefined) {
      this.validatingKeys.delete(key);
      const current = this.pending.get(key);
      if (current !== undefined) {
        current.settled = true;
      }
      this.flushWaiters();
      return;
    }
    const context = this.contextFor(draft, plan, path, record.modelPath);
    Promise.resolve()
      .then(() => (descriptor as AsyncValidatorDefinition).validate(context, abort))
      .then(
        (result) => this.finishAsync(key, generation, runtimeId, plan, record.modelPath, result, undefined),
        (error) => this.finishAsync(key, generation, runtimeId, plan, record.modelPath, undefined, error),
      );
  }

  private finishAsync(
    key: string,
    generation: number,
    runtimeId: RuntimeNodeId,
    plan: NamedValidationPlan,
    modelPath: ModelPath,
    result: unknown,
    error: unknown,
  ): void {
    const current = this.pending.get(key);
    if (current === undefined || current.generation !== generation) {
      return;
    }
    current.settled = true;
    this.validatingKeys.delete(key);
    const bindings = this.host.bindings();
    const path = bindings.pathOf(runtimeId);
    const affected = this.affectedFor(path ?? ROOT_INSTANCE_PATH);
    if (path === undefined || !this.host.isActive(path)) {
      this.revision += 1;
      this.flushWaiters();
      this.host.publishState(affected, true);
      return;
    }
    if (error !== undefined) {
      this.store.removeOwner(key);
      this.host.emit([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.VALIDATOR_FAILED,
          severity: "warning",
          message: "Async validator failed",
          metadata: { validator: plan.key },
        }),
      ]);
      this.revision += 1;
      this.flushWaiters();
      this.host.publishState(affected, true);
      return;
    }
    try {
      const draft = { bindings, values: this.host.values() } as TransactionDraft;
      this.replaceIssues(draft, plan, runtimeId, path, modelPath, result, "async");
    } catch (caught) {
      this.store.removeOwner(key);
      this.host.emit(
        caught instanceof FormRuntimeError
          ? caught.diagnostics.map((diagnostic) => freezeDiagnostic({ ...diagnostic, severity: "warning" }))
          : [
              runtimeDiagnostic({
                code: RUNTIME_DIAGNOSTIC_CODES.VALIDATOR_INVALID_RESULT,
                severity: "warning",
                message: "Async validator returned a malformed result",
                metadata: { validator: plan.key },
              }),
            ],
      );
    }
    this.revision += 1;
    this.flushWaiters();
    this.host.publishState(affected, true);
  }

  private contextFor(
    draft: TransactionDraft,
    plan: NamedValidationPlan,
    path: InstancePath,
    modelPath: ModelPath,
  ): CustomValidatorContext {
    const dependencies: Record<string, JsonValue | undefined> = {};
    for (const dependency of plan.dependencies) {
      const bound = bindTemplatePath(dependency, plan.target, path);
      dependencies[dependency] = getJsonAt(draft.values, parseInstancePath(bound) ?? []);
    }
    return Object.freeze({
      path,
      modelPath,
      target: getJsonAt(draft.values, parseInstancePath(path) ?? []),
      dependencies: Object.freeze(dependencies),
      options: plan.options,
    });
  }

  private clearServerOnChange(draft: TransactionDraft, changeSet: NormalizedChangeSet): boolean {
    if (this.host.model.validation.server.preserveOnChange) {
      return false;
    }
    const leaves = leafValuePaths(changeSet.valuePaths);
    let changed = false;
    for (const path of leaves) {
      if (
        [...draft.orderOnlyArrayPaths].some((arrayPath) => {
          const scope = asInstancePath(arrayPath);
          return path === scope || instancePathStartsWith(path, scope);
        })
      ) {
        continue;
      }
      const id = draft.bindings.idAt(path);
      if (id === undefined) {
        continue;
      }
      changed =
        this.store.removeWhere(
          (record) => record.source === "server" && record.key === `server:${id}` && !record.preserveOnChange,
        ) || changed;
    }
    return changed;
  }

  private invalidateSubtree(ids: ReadonlySet<RuntimeNodeId>): void {
    this.store.removeWhere((record) => record.entries.some((entry) => ids.has(entry.runtimeId)));
    for (const [key, run] of [...this.pending]) {
      if (ids.has(run.runtimeId)) {
        run.abort.abort("removed");
        this.pending.delete(key);
        this.validatingKeys.delete(key);
      }
    }
    this.revision += 1;
    this.flushWaiters();
  }

  private collectAggregate(runtimeId: RuntimeNodeId | undefined): readonly ValidationError[] {
    if (runtimeId === undefined) {
      return EMPTY_ERRORS;
    }
    const bindings = this.host.bindings();
    const errors: ValidationError[] = [...this.store.directErrors(runtimeId)];
    const stack = [...(bindings.children.get(runtimeId) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) {
        continue;
      }
      const path = bindings.pathOf(current);
      if (path === undefined || !this.host.isActive(path)) {
        continue;
      }
      errors.push(...this.store.directErrors(current));
      stack.push(...(bindings.children.get(current) ?? []));
    }
    if (errors.length === 0) {
      return EMPTY_ERRORS;
    }
    const stamp = `${runtimeId}:${this.store.revision}`;
    const cached = this.aggregateCache.get(stamp);
    if (cached !== undefined) {
      return cached;
    }
    const sorted = Object.freeze(sortErrors(errors, new Map(), this.planOrder));
    this.aggregateCache.set(stamp, sorted);
    return sorted;
  }

  private isValidating(runtimeId: RuntimeNodeId | undefined, aggregate: boolean): boolean {
    const bindings = this.host.bindings();
    const scope = runtimeId === undefined ? ROOT_INSTANCE_PATH : bindings.pathOf(runtimeId);
    for (const [key, run] of this.pending) {
      if (!this.validatingKeys.has(key) || run.settled) {
        continue;
      }
      if (run.runtimeId === runtimeId) {
        return true;
      }
      if (aggregate && scope !== undefined) {
        const path = bindings.pathOf(run.runtimeId);
        if (path !== undefined && instancePathStartsWith(path, scope)) {
          return true;
        }
      }
    }
    return false;
  }

  private project(errors: readonly ValidationError[]): readonly ValidationError[] {
    const bindings = this.host.bindings();
    let changed = false;
    const next = errors.map((error) => {
      const runtimeId = bindings.idAt(error.instancePath);
      const current = runtimeId === undefined ? error.instancePath : (bindings.pathOf(runtimeId) ?? error.instancePath);
      if (current === error.instancePath) {
        return error;
      }
      changed = true;
      return Object.freeze({ ...error, instancePath: current });
    });
    return changed ? Object.freeze(next) : errors;
  }

  private flushWaiters(): void {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      waiter();
    }
  }
}

function inferTrigger(changeSet: NormalizedChangeSet, automatic: ValidationTrigger): ValidationTrigger | undefined {
  if (changeSet.reset) {
    return undefined;
  }
  if (automatic === "change" && changeSet.valuePaths.length > 0) {
    return "change";
  }
  if (automatic === "blur" && changeSet.blurred.length > 0) {
    return "blur";
  }
  return undefined;
}

function leafValuePaths(paths: readonly InstancePath[]): InstancePath[] {
  return paths.filter(
    (path) => !paths.some((other) => other !== path && instancePathStartsWith(other, path)),
  );
}

function adapterDiag(message: string, metadata: Readonly<Record<string, unknown>>): Diagnostic {
  return freezeDiagnostic({
    code: RUNTIME_DIAGNOSTIC_CODES.SCHEMA_ADAPTER_FAILED,
    severity: "error",
    message,
    source: "adapter",
    metadata,
  });
}

function applyDiag(message: string, metadata?: Readonly<Record<string, unknown>>): Diagnostic {
  return runtimeDiagnostic({
    code: RUNTIME_DIAGNOSTIC_CODES.APPLY_ERRORS_INVALID,
    message,
    ...(metadata === undefined ? {} : { metadata }),
  });
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isThenable(value: unknown): boolean {
  return value !== null && (typeof value === "object" || typeof value === "function") && typeof (value as { then?: unknown }).then === "function";
}

void JsonCloneError;
