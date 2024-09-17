import type { Diagnostic } from "../../diagnostic/index.js";
import type { CompiledFormModel } from "../../model/compiled-form-model.js";
import type { FormEnvironment } from "../../extension/environment.js";
import type { ArrayItemId, ViewNodeId } from "../../model/identity/index.js";
import type { ViewNode as UIViewNode } from "../../model/ui/ui.js";
import {
  formatInstancePath,
  instancePathAncestors,
  joinInstancePath,
  parseInstancePath,
  ROOT_INSTANCE_PATH,
  ROOT_MODEL_PATH,
  toModelPath,
  asInstancePath,
  type InstancePath,
  type InstancePathLike,
  type ModelPath,
  type ModelPathLike,
} from "../../model/path/index.js";
import { bindTemplatePath } from "../../model/path/bind-path.js";
import type {
  ArrayInstance,
  ArrayItemRef,
  ArrayItemSnapshot,
  FieldInstance,
  FieldSnapshot,
  FormInstance,
  FormSnapshot,
  InstanceBinding,
  JsonValue,
  ScopedFormInstance,
  SerializeOptions,
  ViewSnapshot,
} from "./contracts.js";
import { canMaterializeObject, isFieldPath } from "../dependency/binding.js";
import { ChangeQueue, type RuntimeCommand, type RuntimeCommandResult, type TransactionDraft } from "../transaction/commands.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import { runtimeDiagnostic, sortRuntimeDiagnostics } from "../diagnostics.js";
import { FormRuntimeError } from "../error.js";
import {
  cloneJsonValue,
  diffJsonValuePaths,
  getJsonAt,
  jsonEqual,
  JsonCloneError,
  reuseEqualBranches,
  setJsonPath,
} from "../value/json-value.js";
import {
  freezePhaseSet,
  RUNTIME_COMMAND_LIMIT,
  RUNTIME_ITERATION_LIMIT,
  type NormalizedChangeSet,
  type PhaseSet,
  type TransactionPhaseContext,
} from "../transaction/phases.js";
import {
  getSelectorRecord,
  isRuntimeSelector,
  PRESENTATION_SELECTOR_KEY,
  type RuntimeDiagnosticEvent,
  type RuntimeSelector,
  type SelectorHost,
  type Unsubscribe,
} from "../subscription/selectors.js";
import {
  EffectScheduler,
  FieldStateStore,
  FormStateStore,
  NodeStateStore,
  ValueStoreImpl,
  ViewStateStore,
} from "../state/stores.js";
import { ArrayStateStore } from "../array/array-store.js";
import { BindingIndex } from "../dependency/binding-index.js";
import { ArrayKernel, joinRelativePath, type ArrayKernelDraft } from "../array/array-kernel.js";
import { RuntimeNodeInterner, type RuntimeNodeId } from "./runtime-node-id.js";
import { derefNode, indexDataNodes } from "../templates.js";
import type { ArrayIdentityResolver } from "../array/identity-resolver.js";
import type { RuntimeSubtreeOwner } from "./subtree-lifecycle.js";
import { freezeBindingView } from "./subtree-lifecycle.js";
import {
  RuleDynamicsEngine,
  type AffectedValidationRulePlan,
  type RuleDraftState,
} from "../rule/engine.js";
import { DEFAULT_EFFECTIVE } from "../state/effective.js";
import { bindRuntimeFacade } from "./handle.js";
import { resolveModelPath } from "../scope/render-scope.js";
import {
  buildFieldRequirementIndex,
  requirementSourceOf,
  type FieldRequirementSource,
} from "../state/requirement-index.js";
import { ValidationEngine } from "../validation/engine.js";
import type { ValidationHost } from "../validation/host.js";
import type { NamedValidationPlan } from "../../model/validation/validation.js";
import type { ValidationTrigger } from "../../definition/form-config.js";
import type {
  ApplyErrorsOptions,
  ServerErrorInput,
  SubmitHandler,
  SubmitResult,
  ValidationResult,
} from "../../validation/error.js";

export interface FormRuntimeOptions {
  readonly initialValues?: unknown;
  readonly phases?: Partial<PhaseSet>;
  readonly commandLimit?: number;
  readonly iterationLimit?: number;
  readonly arrayIdentityResolvers?: readonly {
    readonly path: string;
    readonly resolve: ArrayIdentityResolver;
  }[];
  readonly subtreeOwners?: readonly RuntimeSubtreeOwner[];
  readonly validationOwner?: (plan: AffectedValidationRulePlan) => void;
}

interface SelectorCacheEntry {
  readonly value: unknown;
  readonly stamp: string;
}

interface Subscription<T> {
  readonly id: number;
  readonly selector: RuntimeSelector<T>;
  readonly listener: (value: T) => void;
  active: boolean;
  last: T | undefined;
  initialized: boolean;
}

interface DiagnosticSubscription {
  readonly id: number;
  readonly listener: (event: RuntimeDiagnosticEvent) => void;
  active: boolean;
}

export class TransactionManager {
  constructor(private readonly runtime: FormRuntime) {}

  dispatch(command: RuntimeCommand): RuntimeCommandResult {
    return this.runtime.dispatch(command);
  }
}

export class FormRuntime implements SelectorHost {
  readonly model: CompiledFormModel;
  readonly environment: FormEnvironment;
  readonly values: ValueStoreImpl;
  readonly nodes = new NodeStateStore();
  readonly fields = new FieldStateStore();
  readonly views = new ViewStateStore();
  readonly form = new FormStateStore();
  readonly scheduler = new EffectScheduler();
  readonly transaction: TransactionManager;
  readonly facade: FormInstance;
  readonly arrays: ArrayStateStore;
  readonly bindings = new BindingIndex();
  readonly kernel: ArrayKernel;
  readonly interner = new RuntimeNodeInterner();
  readonly engine: RuleDynamicsEngine;
  readonly validation: ValidationEngine;
  lastCommandResult: RuntimeCommandResult = undefined;
  ownerGenerations = new Map<string, number>();

  private extraSelectorKeys = new Set<string>();
  private readonly phases: PhaseSet;
  private readonly commandLimit: number;
  private readonly iterationLimit: number;
  private readonly viewIndex: ReadonlyMap<string, UIViewNode>;
  private readonly viewsByField = new Map<string, ViewNodeId[]>();
  private readonly requirementIndex: ReadonlyMap<ModelPath, FieldRequirementSource>;
  private readonly fieldSnapshots = new Map<string, FieldSnapshot>();
  private readonly viewSnapshots = new Map<string, ViewSnapshot>();
  private readonly bindingSnapshots = new Map<string, InstanceBinding>();
  private cachedFormSnapshot: FormSnapshot | undefined;
  private readonly selectorCache = new WeakMap<RuntimeSelector<unknown>, SelectorCacheEntry>();
  private readonly subscriptions: Subscription<unknown>[] = [];
  private readonly diagnosticObservers: DiagnosticSubscription[] = [];
  private nextSubscriptionId = 1;
  private running = false;
  private publishing = false;
  private readonly pending = new ChangeQueue();
  private affectedKeys: ReadonlySet<string> | undefined;
  private formSnapshotStamp = "";
  private originalInitial: JsonValue;
  private derivedRevision = 1;
  private workingRule: RuleDraftState | undefined;
  private readonly validationOwner: ((plan: AffectedValidationRulePlan) => void) | undefined;
  private forceAllRules = false;
  private validationIntent: ValidationTrigger | undefined;
  private validationChanged = false;
  private currentAttempt = 0;
  private mutationEpoch = 0;
  private pendingAsyncJobs: Array<{ plan: NamedValidationPlan; runtimeId: RuntimeNodeId }> = [];

  constructor(model: CompiledFormModel, environment: FormEnvironment, options?: FormRuntimeOptions) {
    this.model = model;
    this.environment = environment;
    this.phases = freezePhaseSet(options?.phases);
    this.commandLimit = options?.commandLimit ?? RUNTIME_COMMAND_LIMIT;
    this.iterationLimit = options?.iterationLimit ?? RUNTIME_ITERATION_LIMIT;
    this.validationOwner = options?.validationOwner;
    this.viewIndex = indexViews(model.ui.viewTree);
    this.requirementIndex = buildFieldRequirementIndex(model);
    indexFieldViews(model.ui.viewTree, this.viewsByField);
    this.values = new ValueStoreImpl(readInitialValues(model, options?.initialValues));
    this.originalInitial = this.values.current;
    this.engine = new RuleDynamicsEngine(model, environment);
    this.validation = new ValidationEngine(this.createValidationHost());
    this.arrays = new ArrayStateStore(`f${nextInstanceNonce()}`);
    this.kernel = new ArrayKernel(
      model,
      indexDataNodes(model),
      this.interner,
      freezeResolvers(model, options?.arrayIdentityResolvers),
      [this.engine, this.validation, ...(options?.subtreeOwners ?? [])],
    );
    const bootstrap = emptyKernelDraft(this.values.current, this.arrays, this.bindings);
    this.kernel.materializeTree(
      bootstrap,
      model.data.root,
      this.kernel.internRoot(model.data.root),
      this.values.current,
      ROOT_INSTANCE_PATH,
      undefined,
      undefined,
    );
    this.transaction = new TransactionManager(this);
    this.facade = this.createFacade();
    this.stabilizeInitial();
  }

  dispatch(command: RuntimeCommand): RuntimeCommandResult {
    if (this.running || this.publishing) {
      this.pending.enqueue(command);
      return undefined;
    }
    this.lastCommandResult = undefined;
    this.runTransaction([command]);
    this.drainPending();
    return this.lastCommandResult;
  }

  getValues(): JsonValue {
    return this.values.current;
  }

  fieldSnapshot(path: InstancePathLike): FieldSnapshot {
    const binding = this.requireDraftBinding(this.committedView(), path);
    return this.fieldSnapshotAt(binding.path);
  }

  viewSnapshot(id: ViewNodeId): ViewSnapshot {
    if (!this.viewIndex.has(id)) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_VIEW,
          message: `Unknown ViewNodeId: ${id}`,
          metadata: { viewId: id },
        }),
      ]);
    }
    return this.viewSnapshotAt(id);
  }

  formSnapshot(): FormSnapshot {
    const stamp = this.sourceStamp();
    if (this.cachedFormSnapshot !== undefined && this.formSnapshotStamp === stamp) {
      return this.cachedFormSnapshot;
    }
    const effective = this.effectiveAt(ROOT_INSTANCE_PATH);
    const validation = this.validation.formSnapshot();
    const snapshot: FormSnapshot = Object.freeze({
      values: this.values.current,
      dirty: !jsonEqual(this.values.current, this.values.initial),
      touched: this.fields.touched.size > 0,
      version: this.form.version,
      active: effective.active,
      visible: effective.visible,
      disabled: effective.disabled,
      readonly: effective.readonly,
      directErrors: validation.directErrors,
      errors: validation.errors,
      valid: validation.valid,
      validating: validation.validating,
      submitting: validation.submitting,
      submitCount: validation.submitCount,
    });
    this.cachedFormSnapshot = snapshot;
    this.formSnapshotStamp = stamp;
    return snapshot;
  }

  presentableErrors(path: InstancePathLike) {
    const canonical = path === "" ? ROOT_INSTANCE_PATH : this.requireDraftBinding(this.committedView(), path).path;
    const snapshot = canonical === ROOT_INSTANCE_PATH ? this.formSnapshot() : this.fieldSnapshotAt(canonical);
    return this.validation.presentable(snapshot.errors, canonical);
  }

  evaluateSelector<T>(selector: RuntimeSelector<T>): T {
    const record = getSelectorRecord(selector);
    if (record === undefined) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.INVALID_SELECTOR,
          message: "Selector was not created by the runtime API",
        }),
      ]);
    }
    const cached = this.selectorCache.get(selector);
    if (this.affectedKeys !== undefined && !intersects(record.deps, this.affectedKeys)) {
      if (cached !== undefined) {
        return cached.value as T;
      }
    }
    const stamp = this.sourceStamp();
    if (this.affectedKeys === undefined && cached !== undefined && cached.stamp === stamp) {
      return cached.value as T;
    }
    const value = record.project(this);
    const interned = cached !== undefined && Object.is(cached.value, value) ? cached.value : value;
    this.selectorCache.set(selector, { value: interned, stamp });
    return interned as T;
  }

  getRuntimeSnapshot<T>(selector: RuntimeSelector<T>): T {
    this.requireSelector(selector);
    return this.evaluateSelector(selector);
  }

  subscribeRuntime<T>(selector: RuntimeSelector<T>, listener: (value: T) => void): Unsubscribe {
    this.requireSelector(selector);
    const current = this.evaluateSelector(selector);
    const subscription: Subscription<T> = {
      id: this.nextSubscriptionId,
      selector,
      listener,
      active: true,
      last: current,
      initialized: true,
    };
    this.nextSubscriptionId += 1;
    this.subscriptions.push(subscription as Subscription<unknown>);
    let cancelled = false;
    return () => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      subscription.active = false;
    };
  }

  observeDiagnostics(listener: (event: RuntimeDiagnosticEvent) => void): Unsubscribe {
    const subscription: DiagnosticSubscription = {
      id: this.nextSubscriptionId,
      listener,
      active: true,
    };
    this.nextSubscriptionId += 1;
    this.diagnosticObservers.push(subscription);
    let cancelled = false;
    return () => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      subscription.active = false;
    };
  }

  runTransaction(commands: readonly RuntimeCommand[]): void {
    this.running = true;
    const committedVersion = this.form.version;
    const originalValues = this.values.current;
    const originalTouched = new Map(this.fields.touched);
    const originalFocused = new Map(this.views.focused);
    const originalCollapsed = new Map(this.views.collapsed);
    const originalActiveTab = new Map(this.views.activeTab);
    const draft = this.createDraft();
    let committedChangeSet: NormalizedChangeSet | undefined;
    const queue = new ChangeQueue();
    for (const command of commands) {
      queue.enqueue(command);
    }
    this.workingRule = this.engine.snapshot();
    this.validationChanged = false;
    this.pendingAsyncJobs = [];

    try {
      let applied = 0;
      const applyQueued = (): void => {
        while (queue.size > 0) {
          const command = queue.dequeue();
          if (command === undefined) {
            break;
          }
          applied += 1;
          if (applied > this.commandLimit) {
            this.throwDiagnostics([limitDiagnostic(applied, 0, this.commandLimit, this.iterationLimit)]);
          }
          this.applyCommand(draft, command);
          this.scrubRemovedViewState(draft);
        }
      };

      applyQueued();
      if (
        !draftDiffers(
          draft,
          originalValues,
          originalTouched,
          originalFocused,
          originalCollapsed,
          originalActiveTab,
        ) &&
        !draft.identityChanged &&
        !draft.reset &&
        this.validationIntent === undefined
      ) {
        return;
      }

      let iterations = 0;
      let progressed = true;
      while (progressed) {
        iterations += 1;
        if (iterations > this.iterationLimit) {
          this.throwDiagnostics([limitDiagnostic(applied, iterations, this.commandLimit, this.iterationLimit)]);
        }
        const beforeValues = draft.values;
        const beforeTouched = new Map(draft.touched);
        const beforeFocused = new Map(draft.focused);
        const beforeCollapsed = new Map(draft.collapsed);
        const beforeActiveTab = new Map(draft.activeTab);
        this.runPhase("activation", draft, queue, committedVersion, originalValues, originalTouched, originalFocused, originalCollapsed, originalActiveTab, applyQueued);
        applyQueued();
        this.runPhase("rule", draft, queue, committedVersion, originalValues, originalTouched, originalFocused, originalCollapsed, originalActiveTab, applyQueued);
        applyQueued();
        progressed = draftDiffers(draft, beforeValues, beforeTouched, beforeFocused, beforeCollapsed, beforeActiveTab);
      }

      this.runPhase(
        "syncValidation",
        draft,
        queue,
        committedVersion,
        originalValues,
        originalTouched,
        originalFocused,
        originalCollapsed,
        originalActiveTab,
      );
      if (queue.size > 0) {
        this.throwDiagnostics([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.INVALID_COMMAND,
            message: "sync validation cannot enqueue commands into the current transaction",
          }),
        ]);
      }

      if (
        !draftDiffers(
          draft,
          originalValues,
          originalTouched,
          originalFocused,
          originalCollapsed,
          originalActiveTab,
        ) &&
        !draft.identityChanged &&
        !this.workingRule?.derivedChanged &&
        !this.validationChanged &&
        !draft.reset &&
        this.validationIntent === undefined
      ) {
        return;
      }

      committedChangeSet = this.changeSetOf(
        draft,
        originalValues,
        originalTouched,
        originalFocused,
        originalCollapsed,
        originalActiveTab,
      );
      this.commitDraft(draft, committedChangeSet);
      this.lastCommandResult = draft.result;
      if (this.workingRule !== undefined && this.workingRule.oneOfDiagnostics.length > 0) {
        this.emitNonBlocking(this.workingRule.oneOfDiagnostics);
      }
    } catch (error) {
      if (error instanceof FormRuntimeError) {
        throw error;
      }
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.PHASE_FAILED,
          message: "Runtime phase failed",
          metadata: { reason: error instanceof Error ? error.message : "unknown" },
        }),
      ]);
    } finally {
      this.running = false;
      this.workingRule = undefined;
    }

    if (committedChangeSet === undefined || this.form.version === committedVersion) {
      this.affectedKeys = undefined;
      return;
    }

    try {
      this.publishing = true;
      this.publish(committedChangeSet);
      for (const effect of draft.abortEffects) {
        try {
          effect();
        } catch (error) {
          this.emitNonBlocking([
            runtimeDiagnostic({
              code: RUNTIME_DIAGNOSTIC_CODES.PHASE_FAILED,
              severity: "warning",
              message: "Post-commit subtree cleanup failed",
              metadata: { reason: error instanceof Error ? error.message : "unknown" },
            }),
          ]);
        }
      }
    } finally {
      this.publishing = false;
      this.affectedKeys = undefined;
    }

    try {
      this.runPhase(
        "asyncSchedule",
        {
          values: this.values.current,
          touched: new Map(this.fields.touched),
          focused: new Map(this.views.focused),
          collapsed: new Map(this.views.collapsed),
          activeTab: new Map(this.views.activeTab),
          viewOwners: new Map(this.views.owners) as Map<string, RuntimeNodeId>,
          blurred: [],
          reset: committedChangeSet.reset,
          valuesChanged: false,
          touchChanged: false,
          focusChanged: false,
          collapsedChanged: false,
          activeTabChanged: false,
          identityChanged: false,
          arrays: this.arrays,
          bindings: this.bindings,
          orderOnlyArrayPaths: new Set(),
          affectedEntityValues: new Set(),
          affectedAddresses: new Set(),
          affectedArrayOrders: new Set(),
          abortEffects: [],
          generationInvalidations: [],
          removedRuntimeIds: [],
        },
        new ChangeQueue(),
        committedVersion,
        originalValues,
        originalTouched,
        originalFocused,
        originalCollapsed,
        originalActiveTab,
      );
    } catch (error) {
      this.emitNonBlocking([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.PHASE_FAILED,
          severity: "warning",
          message: "Async scheduling phase failed",
          metadata: { reason: error instanceof Error ? error.message : "unknown" },
        }),
      ]);
    }
    const pendingIds = this.validation.pendingRuntimeIds();
    if (pendingIds.length > 0) {
      const keys = new Set<string>(["form"]);
      for (const id of pendingIds) {
        const path = this.bindings.pathOf(id);
        if (path !== undefined) {
          for (const key of this.validation.affectedFor(path)) {
            keys.add(key);
          }
        }
      }
      this.publishValidationState(keys, true);
    }
    this.notifyInstrumentation();
  }

  private drainPending(): void {
    while (this.pending.size > 0 && !this.running && !this.publishing) {
      const command = this.pending.dequeue();
      if (command === undefined) {
        break;
      }
      this.runTransaction([command]);
    }
  }

  private createDraft(): TransactionDraft {
    return {
      values: this.values.current,
      touched: new Map(this.fields.touched),
      focused: new Map(this.views.focused),
      collapsed: new Map(this.views.collapsed),
      activeTab: new Map(this.views.activeTab),
      viewOwners: new Map(this.views.owners) as Map<string, RuntimeNodeId>,
      blurred: [],
      reset: false,
      valuesChanged: false,
      touchChanged: false,
      focusChanged: false,
      collapsedChanged: false,
      activeTabChanged: false,
      identityChanged: false,
      arrays: this.arrays.clone(),
      bindings: this.bindings.clone(),
      orderOnlyArrayPaths: new Set(),
      affectedEntityValues: new Set(),
      affectedAddresses: new Set(),
      affectedArrayOrders: new Set(),
      abortEffects: [],
      generationInvalidations: [],
      removedRuntimeIds: [],
    };
  }

  private applyCommand(draft: TransactionDraft, command: RuntimeCommand): void {
    switch (command.type) {
      case "setValue":
        this.applySetValue(draft, command.path, command.value);
        return;
      case "setValues":
        this.applySetValues(draft, command.value);
        return;
      case "touch":
        this.applyTouch(draft, command.path);
        return;
      case "focus":
        this.applyFocus(draft, command.viewId, command.scopeRuntimeId);
        return;
      case "blur":
        this.applyBlur(draft, command.viewId, command.scopeRuntimeId);
        return;
      case "setCollapsed":
        this.applyCollapsed(draft, command.viewId, command.collapsed, command.scopeRuntimeId);
        return;
      case "setActiveTab":
        this.applyActiveTab(draft, command.viewId, command.tabKey, command.scopeRuntimeId);
        return;
      case "reset":
        this.applyReset(draft);
        return;
      case "arrayAppend":
        this.applyArrayAppend(draft, command.path, command.value);
        return;
      case "arrayInsert":
        this.applyArrayInsert(draft, command.path, command.index, command.value);
        return;
      case "arrayRemove":
        this.applyArrayRemove(draft, command.path, command.item);
        return;
      case "arrayMove":
        this.applyArrayMove(draft, command.path, command.from, command.to);
        return;
      case "arraySetItem":
        this.applyArraySetItem(draft, command.path, command.item, command.value);
        return;
      case "arrayReplaceItem":
        this.applyArrayReplaceItem(draft, command.path, command.item, command.value);
        return;
      case "arrayClear":
        this.applyArrayClear(draft, command.path);
        return;
      default: {
        const exhaustive: never = command;
        void exhaustive;
      }
    }
  }

  private applySetValue(draft: TransactionDraft, path: InstancePathLike, value: unknown): void {
    const binding = this.requireDraftBinding(draft, path);
    const cloned = this.cloneValue(value, binding.path);
    const previous = getJsonAt(draft.values, binding.segments);
    const updated = setJsonPath(draft.values, binding.segments, cloned, (prefix) =>
      canMaterializeObject(this.model, prefix),
    );
    if (!updated.ok) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code:
            updated.reason === "index-oob"
              ? RUNTIME_DIAGNOSTIC_CODES.ARRAY_INDEX_OUT_OF_RANGE
              : updated.reason === "index-write"
                ? RUNTIME_DIAGNOSTIC_CODES.ARRAY_INDEX_OUT_OF_RANGE
                : RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH,
          message:
            updated.reason === "index-oob" || updated.reason === "index-write"
              ? "Array indexes cannot be created by setValue()"
              : `Cannot materialize object containers for ${binding.path}`,
          metadata: { path: binding.path, reason: updated.reason },
        }),
      ]);
    }
    if (!updated.changed) {
      return;
    }
    draft.values = updated.value;
    draft.valuesChanged = true;
    const next = getJsonAt(draft.values, binding.segments);
    const record = draft.bindings.records.get(binding.runtimeId);
    this.kernel.syncSubtree(
      asKernelDraft(draft),
      binding.node,
      binding.runtimeId,
      previous,
      next,
      binding.path,
      record?.parent,
      record?.itemId,
      derefNode(binding.node, this.kernel.byId).kind === "array",
    );
  }

  private applySetValues(draft: TransactionDraft, value: unknown): void {
    const cloned = this.cloneValue(value, ROOT_INSTANCE_PATH);
    const previous = draft.values;
    const next = reuseEqualBranches(draft.values, cloned);
    if (jsonEqual(draft.values, next)) {
      return;
    }
    draft.values = next;
    draft.valuesChanged = true;
    this.kernel.syncSubtree(
      asKernelDraft(draft),
      this.model.data.root,
      this.kernel.internRoot(this.model.data.root),
      previous,
      next,
      ROOT_INSTANCE_PATH,
      undefined,
      undefined,
      true,
    );
  }

  private applyTouch(draft: TransactionDraft, path: InstancePathLike): void {
    const binding = this.requireDraftBinding(draft, path);
    if (!isFieldPath(this.model, binding.path)) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_FIELD,
          message: `InstancePath is not a Field: ${binding.path}`,
          metadata: { path: binding.path },
        }),
      ]);
    }
    if (draft.touched.has(binding.runtimeId)) {
      return;
    }
    draft.touched.set(binding.runtimeId, true);
    draft.touchChanged = true;
  }

  private applyFocus(
    draft: TransactionDraft,
    viewId: ViewNodeId,
    scopeRuntimeId?: RuntimeNodeId,
  ): void {
    this.requireView(viewId);
    if (draft.focused.has(viewId)) {
      this.rememberViewOwner(draft, viewId, scopeRuntimeId);
      return;
    }
    draft.focused.set(viewId, true);
    draft.focusChanged = true;
    this.rememberViewOwner(draft, viewId, scopeRuntimeId);
  }

  private applyBlur(
    draft: TransactionDraft,
    viewId: ViewNodeId,
    scopeRuntimeId?: RuntimeNodeId,
  ): void {
    this.requireView(viewId);
    if (!draft.focused.has(viewId)) {
      return;
    }
    const path = this.viewFieldPath(draft, viewId, scopeRuntimeId);
    const itemChain = this.viewItemChain(draft, viewId, scopeRuntimeId, path);
    draft.focused.delete(viewId);
    if (draft.focused.size === 0 && !draft.collapsed.has(viewId) && !draft.activeTab.has(viewId)) {
      draft.viewOwners.delete(viewId);
    }
    draft.focusChanged = true;
    draft.blurred.push(
      Object.freeze({
        viewId,
        path,
        itemChain,
      }),
    );
  }

  private applyCollapsed(
    draft: TransactionDraft,
    viewId: ViewNodeId,
    collapsed: boolean,
    scopeRuntimeId?: RuntimeNodeId,
  ): void {
    this.requireView(viewId);
    const current = draft.collapsed.has(viewId);
    if (current === collapsed) {
      this.rememberViewOwner(draft, viewId, scopeRuntimeId);
      return;
    }
    if (collapsed) {
      draft.collapsed.set(viewId, true);
    } else {
      draft.collapsed.delete(viewId);
    }
    draft.collapsedChanged = true;
    this.rememberViewOwner(draft, viewId, scopeRuntimeId);
  }

  private applyActiveTab(
    draft: TransactionDraft,
    viewId: ViewNodeId,
    tabKey: string | null,
    scopeRuntimeId?: RuntimeNodeId,
  ): void {
    this.requireView(viewId);
    const current = draft.activeTab.get(viewId);
    const next = tabKey === null ? undefined : tabKey;
    if (current === next) {
      this.rememberViewOwner(draft, viewId, scopeRuntimeId);
      return;
    }
    if (next === undefined) {
      draft.activeTab.delete(viewId);
    } else {
      draft.activeTab.set(viewId, next);
    }
    draft.activeTabChanged = true;
    this.rememberViewOwner(draft, viewId, scopeRuntimeId);
  }

  private requireView(viewId: ViewNodeId): void {
    if (!this.viewIndex.has(viewId)) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_VIEW,
          message: `Unknown ViewNodeId: ${viewId}`,
          metadata: { viewId },
        }),
      ]);
    }
  }

  private rememberViewOwner(
    draft: TransactionDraft,
    viewId: ViewNodeId,
    scopeRuntimeId: RuntimeNodeId | undefined,
  ): void {
    const owner = scopeRuntimeId ?? this.viewBindingRuntimeId(draft, viewId);
    if (owner !== undefined) {
      draft.viewOwners.set(viewId, owner);
    }
  }

  private viewBindingRuntimeId(draft: TransactionDraft, viewId: ViewNodeId): RuntimeNodeId | undefined {
    const node = this.viewIndex.get(viewId);
    const template = viewTemplatePath(node);
    if (template === undefined || template.includes("[]") || template.includes("[#")) {
      return undefined;
    }
    const instance = asInstancePath(template);
    return draft.bindings.idAt(instance);
  }

  private viewFieldPath(
    draft: TransactionDraft,
    viewId: ViewNodeId,
    scopeRuntimeId: RuntimeNodeId | undefined,
  ): InstancePath {
    const node = this.viewIndex.get(viewId);
    const template = viewTemplatePath(node);
    if (template === undefined) {
      return scopeRuntimeId === undefined
        ? ROOT_INSTANCE_PATH
        : (draft.bindings.pathOf(scopeRuntimeId) ?? ROOT_INSTANCE_PATH);
    }
    if (scopeRuntimeId !== undefined) {
      const scopePath = draft.bindings.pathOf(scopeRuntimeId) ?? ROOT_INSTANCE_PATH;
      const scopeRecord = draft.bindings.records.get(scopeRuntimeId);
      const scopeModel = scopeRecord?.modelPath ?? ROOT_MODEL_PATH;
      if (template.includes("[]") || template.includes("[#")) {
        return bindTemplatePath(template as ModelPath, scopeModel, scopePath);
      }
      if (template.length === 0) {
        return scopePath;
      }
      return joinRelativePath(scopePath, template);
    }
    if (!template.includes("[]") && !template.includes("[#")) {
      return asInstancePath(template);
    }
    return ROOT_INSTANCE_PATH;
  }

  private viewItemChain(
    draft: TransactionDraft,
    viewId: ViewNodeId,
    scopeRuntimeId: RuntimeNodeId | undefined,
    path: InstancePath,
  ): readonly ArrayItemId[] {
    const runtimeId =
      scopeRuntimeId ??
      draft.bindings.idAt(path) ??
      this.viewBindingRuntimeId(draft, viewId);
    if (runtimeId === undefined) {
      return Object.freeze([]);
    }
    return draft.bindings.itemChainOf(runtimeId);
  }

  private scrubRemovedViewState(draft: TransactionDraft): void {
    if (draft.removedRuntimeIds.length === 0) {
      return;
    }
    const removed = new Set(draft.removedRuntimeIds);
    for (const [viewId, owner] of [...draft.viewOwners.entries()]) {
      if (!removed.has(owner)) {
        continue;
      }
      draft.focused.delete(viewId);
      draft.collapsed.delete(viewId);
      draft.activeTab.delete(viewId);
      draft.viewOwners.delete(viewId);
      draft.focusChanged = true;
      draft.collapsedChanged = true;
      draft.activeTabChanged = true;
    }
  }

  private applyReset(draft: TransactionDraft): void {
    const valuesChanged = !jsonEqual(draft.values, this.originalInitial);
    const touchChanged = draft.touched.size > 0;
    const focusChanged = draft.focused.size > 0;
    const collapsedChanged = draft.collapsed.size > 0;
    const activeTabChanged = draft.activeTab.size > 0;
    const hadItems = arrayItemCount(draft.arrays) > 0 || arrayItemCount(this.arrays) > 0;
    const validationDirty = this.validation.hasLifecycleState();
    if (!valuesChanged && !touchChanged && !focusChanged && !collapsedChanged && !activeTabChanged && !hadItems && !validationDirty) {
      return;
    }
    draft.values = this.originalInitial;
    draft.touched.clear();
    draft.focused.clear();
    draft.collapsed.clear();
    draft.activeTab.clear();
    draft.viewOwners.clear();
    draft.reset = true;
    draft.valuesChanged = valuesChanged || draft.valuesChanged;
    draft.touchChanged = touchChanged || draft.touchChanged;
    draft.focusChanged = focusChanged || draft.focusChanged;
    draft.collapsedChanged = collapsedChanged || draft.collapsedChanged;
    draft.activeTabChanged = activeTabChanged || draft.activeTabChanged;
    if (hadItems) {
      this.kernel.rebuildAll(asKernelDraft(draft), draft.values);
      draft.identityChanged = true;
    }
  }

  private commitDraft(draft: TransactionDraft, changeSet: NormalizedChangeSet): void {
    if (!jsonEqual(this.values.current, draft.values)) {
      this.values.current = draft.values;
      this.values.revision += 1;
    }
    if (!mapsEqual(this.fields.touched, draft.touched)) {
      this.fields.touched.clear();
      for (const [path] of draft.touched) {
        this.fields.touched.set(path, true);
      }
      this.fields.revision += 1;
    }
    if (!mapsEqual(this.views.focused, draft.focused)) {
      this.views.focused.clear();
      for (const [id] of draft.focused) {
        this.views.focused.set(id, true);
      }
      this.views.revision += 1;
    }
    if (!mapsEqual(this.views.collapsed, draft.collapsed)) {
      this.views.collapsed.clear();
      for (const [id] of draft.collapsed) {
        this.views.collapsed.set(id, true);
      }
      this.views.revision += 1;
    }
    if (!stringMapsEqual(this.views.activeTab, draft.activeTab)) {
      this.views.activeTab.clear();
      for (const [id, tab] of draft.activeTab) {
        this.views.activeTab.set(id, tab);
      }
      this.views.revision += 1;
    }
    this.views.owners.clear();
    for (const [id, owner] of draft.viewOwners) {
      this.views.owners.set(id, owner);
    }
    this.form.version += 1;
    this.form.revision += 1;
    this.mutationEpoch += 1;
    if (draft.reset) {
      this.values.initial = draft.values;
    }
    this.extraSelectorKeys = new Set();
    if (changeSet.reset) {
      this.extraSelectorKeys.add(PRESENTATION_SELECTOR_KEY);
    }
    if (this.validationChanged) {
      for (const key of this.validation.selectorKeysForDirty()) {
        this.extraSelectorKeys.add(key);
      }
      for (const path of changeSet.valuePaths) {
        for (const key of this.validation.affectedFor(path)) {
          this.extraSelectorKeys.add(key);
        }
      }
      for (const path of changeSet.fieldPaths) {
        this.extraSelectorKeys.add(`validation:${path}`);
        this.extraSelectorKeys.add(`field:${path}`);
      }
    }
    if (this.workingRule !== undefined) {
      const previous = this.engine.peekState();
      const changed = this.engine.changedEffectivePaths(previous, this.workingRule);
      this.engine.commit(this.workingRule);
      if (changed.length > 0) {
        this.derivedRevision += 1;
      }
      const marked = new Set<string>();
      const mark = (path: InstancePath): void => {
        if (marked.has(path)) {
          return;
        }
        marked.add(path);
        this.extraSelectorKeys.add(`effective:${path}`);
        this.extraSelectorKeys.add(`field:${path}`);
        this.fieldSnapshots.delete(path);
        for (const viewId of this.viewsForInstance(path)) {
          this.extraSelectorKeys.add(`view:${viewId}`);
          this.viewSnapshots.delete(viewId);
        }
      };
      for (const path of changed) {
        mark(path);
        for (const candidate of this.bindings.pathToId.keys()) {
          const child = candidate as InstancePath;
          if (isUnderInstancePath(child, path)) {
            mark(child);
          }
        }
      }
    }
    for (const path of draft.affectedArrayOrders) {
      this.extraSelectorKeys.add(`array-order:${path}`);
    }
    for (const [path, previousId] of this.bindings.pathToId) {
      if (draft.bindings.pathToId.get(path) !== previousId) {
        this.extraSelectorKeys.add(`binding:${path}`);
        this.bindingSnapshots.delete(path);
      }
    }
    for (const path of draft.bindings.pathToId.keys()) {
      if (!this.bindings.pathToId.has(path)) {
        this.extraSelectorKeys.add(`binding:${path}`);
        this.bindingSnapshots.delete(path);
      }
    }
    for (const id of draft.affectedAddresses) {
      this.extraSelectorKeys.add(`address:${id}`);
    }
    for (const id of draft.affectedEntityValues) {
      this.extraSelectorKeys.add(`entity-value:${id}`);
    }
    this.arrays.arrays.clear();
    this.arrays.itemOwner.clear();
    this.arrays.nextSeq = draft.arrays.nextSeq;
    for (const [id, record] of draft.arrays.arrays) {
      this.arrays.arrays.set(id, { order: [...record.order] });
    }
    for (const [item, owner] of draft.arrays.itemOwner) {
      this.arrays.itemOwner.set(item, owner);
    }
    this.bindings.pathToId.clear();
    this.bindings.idToPath.clear();
    this.bindings.records.clear();
    this.bindings.children.clear();
    for (const [path, id] of draft.bindings.pathToId) {
      this.bindings.pathToId.set(path, id);
    }
    for (const [id, path] of draft.bindings.idToPath) {
      this.bindings.idToPath.set(id, path);
    }
    for (const [id, record] of draft.bindings.records) {
      this.bindings.records.set(id, record);
    }
    for (const [id, kids] of draft.bindings.children) {
      this.bindings.children.set(id, [...kids]);
    }
    for (const token of draft.generationInvalidations) {
      this.ownerGenerations.set(token, (this.ownerGenerations.get(token) ?? 0) + 1);
    }
    this.cachedFormSnapshot = undefined;
    this.formSnapshotStamp = "";
    for (const path of changeSet.fieldPaths) {
      this.fieldSnapshots.delete(path);
    }
    for (const path of changeSet.valuePaths) {
      this.fieldSnapshots.delete(path);
    }
    for (const id of changeSet.viewIds) {
      this.viewSnapshots.delete(id);
    }
    if (this.workingRule?.derivedChanged) {
      this.viewSnapshots.clear();
    }
  }

  private publish(changeSet: NormalizedChangeSet): void {
    const affected = affectedDependencyKeys(changeSet, this.extraSelectorKeys);
    this.affectedKeys = affected;
    const batch = this.subscriptions.filter((item) => item.active);
    for (const subscription of batch) {
      if (!subscription.active) {
        continue;
      }
      const record = getSelectorRecord(subscription.selector);
      if (record === undefined || !intersects(record.deps, affected)) {
        continue;
      }
      let next: unknown;
      try {
        next = this.evaluateSelector(subscription.selector);
      } catch (error) {
        this.emitNonBlocking([normalizeThrown("selector", error)]);
        continue;
      }
      if (subscription.initialized && Object.is(subscription.last, next)) {
        continue;
      }
      subscription.last = next;
      subscription.initialized = true;
      try {
        subscription.listener(next);
      } catch (error) {
        this.emitNonBlocking([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.SUBSCRIBER_THREW,
            severity: "warning",
            message: "Runtime subscriber threw",
            metadata: { reason: error instanceof Error ? error.message : "unknown" },
          }),
        ]);
      }
    }
  }

  private runPhase(
    phase: "activation" | "rule" | "syncValidation" | "asyncSchedule",
    draft: TransactionDraft,
    queue: ChangeQueue,
    committedVersion: number,
    originalValues: JsonValue,
    originalTouched: ReadonlyMap<string, true>,
    originalFocused: ReadonlyMap<string, true>,
    originalCollapsed: ReadonlyMap<string, true>,
    originalActiveTab: ReadonlyMap<string, string>,
    flush: () => void = () => undefined,
  ): void {
    const context: TransactionPhaseContext = Object.freeze({
      phase,
      committedVersion,
      changeSet: this.changeSetOf(
        draft,
        originalValues,
        originalTouched,
        originalFocused,
        originalCollapsed,
        originalActiveTab,
      ),
      getValue: (path: InstancePath | string) => {
        const segments = parseInstancePath(path);
        if (segments === undefined) {
          return undefined;
        }
        return getJsonAt(draft.values, segments);
      },
      enqueue: (command: RuntimeCommand) => {
        if (phase !== "activation" && phase !== "rule") {
          throw new FormRuntimeError([
            runtimeDiagnostic({
              code: RUNTIME_DIAGNOSTIC_CODES.INVALID_COMMAND,
              message: `${phase} cannot enqueue commands into the current transaction`,
              metadata: { phase },
            }),
          ]);
        }
        queue.enqueue(command);
        if (phase === "rule") {
          flush();
        }
      },
    });
    try {
      if (phase === "activation" && this.workingRule !== undefined) {
        this.engine.activate(draft, this.workingRule);
      }
      if (phase === "rule" && this.workingRule !== undefined) {
        this.engine.runRules(
          draft,
          this.workingRule,
          context.changeSet.valuePaths,
          (command) => context.enqueue(command),
          draft.reset || this.forceAllRules,
        );
      }
      if (phase === "syncValidation" && this.workingRule !== undefined) {
        const plan = this.engine.validationPlan(this.workingRule);
        this.validationOwner?.(plan);
        this.validationChanged = this.validation.sync(draft, context.changeSet, this.validationIntent, plan);
        this.pendingAsyncJobs = this.validation.collectAsync(draft, context.changeSet, this.validationIntent);
        if (this.validationChanged) {
          this.extraSelectorKeys.add("form");
        }
      }
      if (phase === "asyncSchedule") {
        this.currentAttempt = this.validation.beginAttempt();
        this.validation.startAsync(
          {
            values: this.values.current,
            touched: new Map(this.fields.touched),
            focused: new Map(this.views.focused),
            collapsed: new Map(this.views.collapsed),
            activeTab: new Map(this.views.activeTab),
            viewOwners: new Map(this.views.owners) as Map<string, RuntimeNodeId>,
            blurred: [],
            reset: false,
            valuesChanged: false,
            touchChanged: false,
            focusChanged: false,
            collapsedChanged: false,
            activeTabChanged: false,
            identityChanged: false,
            arrays: this.arrays,
            bindings: this.bindings,
            orderOnlyArrayPaths: new Set(),
            affectedEntityValues: new Set(),
            affectedAddresses: new Set(),
            affectedArrayOrders: new Set(),
            abortEffects: [],
            generationInvalidations: [],
            removedRuntimeIds: [],
          },
          this.pendingAsyncJobs,
          this.currentAttempt,
        );
        this.pendingAsyncJobs = [];
      }
      this.phases[phase](context);
    } catch (error) {
      if (error instanceof FormRuntimeError) {
        throw error;
      }
      throw new FormRuntimeError(
        sortRuntimeDiagnostics([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.PHASE_FAILED,
            message: `Runtime ${phase} phase failed`,
            metadata: { phase, reason: error instanceof Error ? error.message : "unknown" },
          }),
        ]),
      );
    }
  }

  private notifyInstrumentation(): void {
    for (const definition of this.environment.instrumentation.values()) {
      if (typeof definition.observe !== "function") {
        continue;
      }
      try {
        definition.observe(Object.freeze({ type: "runtime.commit" }));
      } catch (error) {
        this.emitNonBlocking([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.INSTRUMENTATION_THREW,
            severity: "warning",
            message: "Runtime instrumentation threw",
            metadata: { reason: error instanceof Error ? error.message : "unknown" },
          }),
        ]);
      }
    }
  }

  private emitNonBlocking(diagnostics: readonly Diagnostic[]): void {
    const event: RuntimeDiagnosticEvent = Object.freeze({
      diagnostics: sortRuntimeDiagnostics(diagnostics),
      version: this.form.version,
    });
    const batch = this.diagnosticObservers.filter((item) => item.active);
    for (const observer of batch) {
      if (!observer.active) {
        continue;
      }
      try {
        observer.listener(event);
      } catch {
        // Diagnostic observers cannot recursively report.
      }
    }
  }

  private changeSetOf(
    draft: TransactionDraft,
    committedValues: JsonValue,
    committedTouched: ReadonlyMap<string, true>,
    committedFocused: ReadonlyMap<string, true>,
    committedCollapsed: ReadonlyMap<string, true>,
    committedActiveTab: ReadonlyMap<string, string>,
  ): NormalizedChangeSet {
    const valuePaths = diffJsonValuePaths(committedValues, draft.values, (segments) =>
      formatInstancePath(segments),
    ) as InstancePath[];
    const fieldPaths = new Set<InstancePath>();
    for (const runtimeId of uniqueTouchedIds(committedTouched, draft.touched)) {
      const path = draft.bindings.pathOf(runtimeId as RuntimeNodeId) ?? this.bindings.pathOf(runtimeId as RuntimeNodeId);
      if (path === undefined) {
        continue;
      }
      fieldPaths.add(path);
      for (const ancestor of instancePathAncestors(path)) {
        fieldPaths.add(ancestor);
      }
    }
    for (const path of valuePaths) {
      fieldPaths.add(path);
      for (const ancestor of instancePathAncestors(path)) {
        fieldPaths.add(ancestor);
      }
    }
    const viewIds = uniqueViewState(
      committedFocused,
      draft.focused,
      committedCollapsed,
      draft.collapsed,
      committedActiveTab,
      draft.activeTab,
    );
    return Object.freeze({
      valuePaths: Object.freeze([...valuePaths]),
      fieldPaths: Object.freeze([...fieldPaths]),
      viewIds: Object.freeze(viewIds),
      blurred: Object.freeze(draft.blurred.map((item) => Object.freeze({ ...item }))),
      reset: draft.reset,
    });
  }

  private fieldSnapshotAt(path: InstancePath): FieldSnapshot {
    const value = getJsonAt(this.values.current, parseInstancePath(path) ?? []);
    const initial = getJsonAt(this.values.initial, parseInstancePath(path) ?? []);
    const dirty = !jsonEqual(value, initial);
    const touched = this.isAggregateTouched(path);
    const effective = this.effectiveAt(path);
    const runtimeId = this.bindings.idAt(path);
    const validation = this.validation.nodeSnapshot(runtimeId, true);
    const cached = this.fieldSnapshots.get(path);
    if (
      cached !== undefined &&
      Object.is(cached.value, value) &&
      cached.dirty === dirty &&
      cached.touched === touched &&
      cached.active === effective.active &&
      cached.visible === effective.visible &&
      cached.disabled === effective.disabled &&
      cached.readonly === effective.readonly &&
      cached.required === effective.required &&
      cached.errors === validation.errors &&
      cached.directErrors === validation.directErrors &&
      cached.valid === validation.valid &&
      cached.validating === validation.validating
    ) {
      return cached;
    }
    const snapshot: FieldSnapshot = Object.freeze({
      path,
      value,
      dirty,
      touched,
      ...effective,
      directErrors: validation.directErrors,
      errors: validation.errors,
      valid: validation.valid,
      validating: validation.validating,
    });
    this.fieldSnapshots.set(path, snapshot);
    return snapshot;
  }

  private isAggregateTouched(path: InstancePath): boolean {
    for (const runtimeId of this.fields.touched.keys()) {
      const current = this.bindings.pathOf(runtimeId as RuntimeNodeId);
      if (current === undefined) {
        continue;
      }
      if (current === path || path === ROOT_INSTANCE_PATH || current.startsWith(`${path}.`) || current.startsWith(`${path}[`)) {
        return true;
      }
    }
    return false;
  }

  private viewSnapshotAt(id: ViewNodeId): ViewSnapshot {
    const focused = this.views.focused.has(id);
    const collapsed = this.views.collapsed.has(id);
    const activeTab = this.views.activeTab.get(id);
    const effective = this.viewEffective(id);
    const cached = this.viewSnapshots.get(id);
    if (
      cached !== undefined &&
      cached.focused === focused &&
      cached.collapsed === collapsed &&
      cached.activeTab === activeTab &&
      cached.active === effective.active &&
      cached.visible === effective.visible &&
      cached.disabled === effective.disabled &&
      cached.readonly === effective.readonly &&
      cached.required === effective.required
    ) {
      return cached;
    }
    const snapshot: ViewSnapshot = Object.freeze({
      id,
      focused,
      collapsed,
      activeTab,
      ...effective,
    });
    this.viewSnapshots.set(id, snapshot);
    return snapshot;
  }

  getValue(path: InstancePathLike): JsonValue | undefined {
    const binding = this.requireDraftBinding(this.committedView(), path);
    return getJsonAt(this.values.current, binding.segments);
  }

  private requireDraftBinding(draft: TransactionDraft | ArrayKernelDraft, path: InstancePathLike) {
    try {
      return this.kernel.requireBinding(asKernelDraft(draft as TransactionDraft), path);
    } catch (error) {
      if (error instanceof FormRuntimeError) {
        throw error;
      }
      throw error;
    }
  }

  private committedView(): TransactionDraft {
    return {
      values: this.values.current,
      touched: this.fields.touched,
      focused: this.views.focused,
      collapsed: this.views.collapsed,
      activeTab: this.views.activeTab,
      viewOwners: this.views.owners as Map<string, RuntimeNodeId>,
      blurred: [],
      reset: false,
      valuesChanged: false,
      touchChanged: false,
      focusChanged: false,
      collapsedChanged: false,
      activeTabChanged: false,
      identityChanged: false,
      arrays: this.arrays,
      bindings: this.bindings,
      orderOnlyArrayPaths: new Set(),
      affectedEntityValues: new Set(),
      affectedAddresses: new Set(),
      affectedArrayOrders: new Set(),
      abortEffects: [],
      generationInvalidations: [],
      removedRuntimeIds: [],
    };
  }

  private requireSelector(selector: RuntimeSelector<unknown>): void {
    if (!isRuntimeSelector(selector)) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.INVALID_SELECTOR,
          message: "Selector was not created by the runtime API",
        }),
      ]);
    }
  }

  private cloneValue(value: unknown, path: InstancePath): JsonValue {
    try {
      return cloneJsonValue(value);
    } catch (error) {
      const reason = error instanceof JsonCloneError ? error.reason : "non-json";
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.INVALID_VALUE,
          message: "Value is not a JSON-compatible snapshot",
          metadata: { path, reason },
        }),
      ]);
    }
  }

  private sourceStamp(): string {
    return `${this.values.revision}:${this.fields.revision}:${this.views.revision}:${this.form.revision}:${this.derivedRevision}:${this.validation.revision}:${this.validation.store.revision}`;
  }

  private throwDiagnostics(diagnostics: readonly Diagnostic[]): never {
    throw new FormRuntimeError(sortRuntimeDiagnostics(diagnostics));
  }

  private effectiveAt(path: InstancePath) {
    const draft = this.committedView();
    const state = this.workingRule ?? this.engine.peekState();
    return this.engine.effective(path, draft, state);
  }

  private viewEffective(id: ViewNodeId) {
    const node = this.viewIndex.get(id);
    if (node?.kind === "field") {
      const instance = node.fieldPath.includes("[]") || node.fieldPath.includes("[#")
        ? undefined
        : asInstancePath(node.fieldPath);
      if (instance !== undefined) {
        try {
          return this.effectiveAt(instance);
        } catch {
          return DEFAULT_EFFECTIVE;
        }
      }
    }
    if (node && "path" in node && typeof node.path === "string" && !node.path.includes("[]")) {
      try {
        return this.effectiveAt(asInstancePath(node.path));
      } catch {
        return DEFAULT_EFFECTIVE;
      }
    }
    return this.effectiveAt(ROOT_INSTANCE_PATH);
  }

  serialize(options?: SerializeOptions): JsonValue {
    const draft = this.committedView();
    const state = this.engine.peekState();
    return this.engine.serialize(draft, state, options, this.form.version);
  }

  async validate(): Promise<ValidationResult> {
    this.validationIntent = "manual";
    try {
      this.runTransaction([]);
    } finally {
      this.validationIntent = undefined;
    }
    const mutation = this.mutationEpoch;
    await this.validation.waitForAttempt(this.currentAttempt, mutation);
    return this.validation.result(this.form.version, this.mutationEpoch !== mutation);
  }

  applyErrors(errors: readonly ServerErrorInput[], options?: ApplyErrorsOptions): void {
    const changed = this.validation.applyErrors(errors, options);
    if (changed) {
      this.publishValidationState(this.validation.selectorKeysForDirty(), true);
    }
  }

  async submit(handler: SubmitHandler): Promise<SubmitResult> {
    this.validation.beginSubmit();
    this.publishValidationState(new Set(["form", PRESENTATION_SELECTOR_KEY]), true);
    try {
      this.validationIntent = "submit";
      try {
        this.runTransaction([]);
      } finally {
        this.validationIntent = undefined;
      }
      const mutation = this.mutationEpoch;
      await this.validation.waitForAttempt(this.currentAttempt, mutation);
      const superseded = this.mutationEpoch !== mutation;
      const validation = this.validation.result(this.form.version, superseded);
      if (!validation.valid || superseded) {
        return this.validation.submitResult(this.form.version, superseded, false);
      }
      const payload = this.serialize();
      await handler(payload);
      return this.validation.submitResult(this.form.version, false, true, payload);
    } finally {
      this.validation.endSubmit();
      this.publishValidationState(new Set(["form"]), true);
    }
  }

  private createValidationHost(): ValidationHost {
    const runtime = this;
    return {
      model: runtime.model,
      environment: runtime.environment,
      bindings(draft) {
        return draft?.bindings ?? runtime.bindings;
      },
      values(draft) {
        return draft?.values ?? runtime.values.current;
      },
      version() {
        return runtime.form.version;
      },
      mutationEpoch() {
        return runtime.mutationEpoch;
      },
      isActive(path) {
        return runtime.effectiveAt(path).active;
      },
      activationChanged(path) {
        if (runtime.workingRule === undefined) {
          return false;
        }
        const previous = runtime.engine.peekState();
        return (
          runtime.engine.schemaEffectiveActive(path, previous) !==
          runtime.engine.schemaEffectiveActive(path, runtime.workingRule)
        );
      },
      isTouched(path) {
        return runtime.isAggregateTouched(path);
      },
      serialize(options) {
        return runtime.serialize(options);
      },
      emit(diagnostics) {
        runtime.emitNonBlocking(diagnostics);
      },
      fail(diagnostics) {
        return runtime.throwDiagnostics(diagnostics);
      },
      publishState(affected, bumpVersion) {
        runtime.publishValidationState(affected, bumpVersion);
      },
    };
  }

  private publishValidationState(affected: ReadonlySet<string>, bumpVersion: boolean): void {
    if (this.running) {
      this.extraSelectorKeys = new Set([...this.extraSelectorKeys, ...affected]);
      return;
    }
    if (bumpVersion) {
      this.form.version += 1;
      this.form.revision += 1;
    }
    this.cachedFormSnapshot = undefined;
    this.formSnapshotStamp = "";
    this.fieldSnapshots.clear();
    this.extraSelectorKeys = new Set(affected);
    this.publish({
      valuePaths: Object.freeze([]),
      fieldPaths: Object.freeze([]),
      viewIds: Object.freeze([]),
      blurred: Object.freeze([]),
      reset: false,
    });
  }

  private stabilizeInitial(): void {
    this.forceAllRules = true;
    const state = this.engine.snapshot();
    this.workingRule = state;
    const draft = this.createDraft();
    const queue = new ChangeQueue();
    const applyQueued = (): void => {
      while (queue.size > 0) {
        const command = queue.dequeue();
        if (command !== undefined) {
          this.applyCommand(draft, command);
        }
      }
    };
    try {
      let iterations = 0;
      let progressed = true;
      while (progressed) {
        iterations += 1;
        if (iterations > this.iterationLimit) {
          this.throwDiagnostics([limitDiagnostic(0, iterations, this.commandLimit, this.iterationLimit)]);
        }
        const before = draft.values;
        this.engine.activate(draft, state);
        applyQueued();
        this.engine.runRules(draft, state, [], (command) => {
          queue.enqueue(command);
          applyQueued();
        }, true);
        applyQueued();
        progressed = !jsonEqual(draft.values, before);
      }
      this.validationOwner?.(this.engine.validationPlan(state));
      this.values.current = draft.values;
      this.values.initial = draft.values;
      this.engine.commit(state);
      this.derivedRevision += 1;
      this.cachedFormSnapshot = undefined;
    } finally {
      this.forceAllRules = false;
      this.workingRule = undefined;
    }
  }

  private createFacade(): FormInstance {
    const runtime = this;
    const facade: FormInstance = {
      model: runtime.model,
      getValue(path) {
        return runtime.getValue(path);
      },
      getValues() {
        return runtime.getValues();
      },
      getState() {
        return runtime.formSnapshot();
      },
      getField(path) {
        return runtime.createField(path);
      },
      setValue(path, value) {
        runtime.dispatch({ type: "setValue", path, value });
      },
      setValues(values) {
        runtime.dispatch({ type: "setValues", value: values });
      },
      touch(path) {
        runtime.dispatch({ type: "touch", path });
      },
      focus(viewId) {
        runtime.dispatch({ type: "focus", viewId });
      },
      blur(viewId) {
        runtime.dispatch({ type: "blur", viewId });
      },
      setCollapsed(viewId, collapsed) {
        runtime.dispatch({ type: "setCollapsed", viewId, collapsed });
      },
      setActiveTab(viewId, tabKey) {
        runtime.dispatch({ type: "setActiveTab", viewId, tabKey });
      },
      reset() {
        runtime.dispatch({ type: "reset" });
      },
      array(path) {
        return runtime.createArray(path);
      },
      scope(path) {
        return runtime.createScope(path);
      },
      serialize(options) {
        return runtime.serialize(options);
      },
      validate() {
        return runtime.validate();
      },
      applyErrors(errors, options) {
        runtime.applyErrors(errors, options);
      },
      submit(handler) {
        return runtime.submit(handler);
      },
    };
    bindRuntimeFacade(facade, runtime, runtime.rootRuntimeId());
    return Object.freeze(facade);
  }

  private createField(path: InstancePathLike, baseRuntimeId?: RuntimeNodeId): FieldInstance {
    const binding = this.requireDraftBinding(this.committedView(), path);
    const runtime = this;
    const runtimeId = binding.runtimeId;
    const field: FieldInstance = {
      get path() {
        runtime.assertLive(runtimeId);
        return runtime.bindings.pathOf(runtimeId) ?? binding.path;
      },
      getValue() {
        runtime.assertLive(runtimeId);
        const current = runtime.bindings.pathOf(runtimeId) ?? binding.path;
        return runtime.getValue(current);
      },
      getState() {
        runtime.assertLive(runtimeId);
        const current = runtime.bindings.pathOf(runtimeId) ?? binding.path;
        return runtime.fieldSnapshotAt(current);
      },
      setValue(value) {
        runtime.assertLive(runtimeId);
        const current = runtime.bindings.pathOf(runtimeId) ?? binding.path;
        runtime.dispatch({ type: "setValue", path: current, value });
      },
      touch() {
        runtime.assertLive(runtimeId);
        const current = runtime.bindings.pathOf(runtimeId) ?? binding.path;
        runtime.dispatch({ type: "touch", path: current });
      },
    };
    void baseRuntimeId;
    return Object.freeze(field);
  }

  createArray(path: InstancePathLike): ArrayInstance {
    const binding = this.kernel.requireArray(asKernelDraft(this.committedView()), path);
    return this.arrayFacade(binding.runtimeId);
  }

  createScope(path: InstancePathLike): ScopedFormInstance {
    const binding = this.requireDraftBinding(this.committedView(), path);
    return this.scopeFacade(binding.runtimeId);
  }

  arrayOrder(path: InstancePathLike): readonly ArrayItemId[] {
    const array = this.kernel.requireArray(asKernelDraft(this.committedView()), path);
    const order = this.arrays.arrays.get(array.runtimeId)?.order ?? [];
    return Object.freeze([...order]);
  }

  arrayItems(path: InstancePathLike): readonly ArrayItemSnapshot[] {
    const array = this.kernel.requireArray(asKernelDraft(this.committedView()), path);
    return this.snapshotsFor(array.runtimeId);
  }

  arrayItemSnapshot(path: InstancePathLike, ref: ArrayItemRef): ArrayItemSnapshot {
    const array = this.kernel.requireArray(asKernelDraft(this.committedView()), path);
    const index = this.kernel.resolveItemIndex(asKernelDraft(this.committedView()), array.runtimeId, ref, array.path);
    const snapshot = this.snapshotsFor(array.runtimeId)[index];
    if (snapshot === undefined) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.ARRAY_INDEX_OUT_OF_RANGE,
          message: "Array index is out of range",
          metadata: { path: array.path, index },
        }),
      ]);
    }
    return snapshot;
  }

  currentBinding(path: InstancePathLike) {
    const binding = this.requireDraftBinding(this.committedView(), path);
    return this.projectInstanceBinding(binding.runtimeId);
  }

  itemValue(itemId: ArrayItemId, relative?: InstancePathLike): JsonValue | undefined {
    const path = this.pathForItem(itemId);
    return this.getValue(joinRelativePath(path, relative));
  }

  itemPath(itemId: ArrayItemId): InstancePath {
    return this.pathForItem(itemId);
  }

  private pathForItem(itemId: ArrayItemId): InstancePath {
    const owner = this.arrays.itemOwner.get(itemId);
    if (owner === undefined) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_ARRAY_ITEM,
          message: "Array item id is unknown",
          metadata: { item: String(itemId) },
        }),
      ]);
    }
    const order = this.arrays.arrays.get(owner)?.order ?? [];
    const index = order.indexOf(itemId);
    const arrayPath = this.bindings.pathOf(owner);
    if (index < 0 || arrayPath === undefined) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_ARRAY_ITEM,
          message: "Array item id is unknown",
          metadata: { item: String(itemId) },
        }),
      ]);
    }
    return joinInstancePath(arrayPath, { kind: "index", index });
  }

  bindingView() {
    return freezeBindingView({
      pathOf: (id) => this.bindings.pathOf(id),
      idAt: (path) => this.bindings.idAt(path),
    });
  }

  private snapshotsFor(arrayRid: RuntimeNodeId): readonly ArrayItemSnapshot[] {
    const arrayPath = this.bindings.pathOf(arrayRid);
    const order = this.arrays.arrays.get(arrayRid)?.order ?? [];
    if (arrayPath === undefined) {
      return Object.freeze([]);
    }
    const items = order.map((id, index) => {
      const path = joinInstancePath(arrayPath, { kind: "index", index });
      return Object.freeze({
        id,
        index,
        path,
        value: getJsonAt(this.values.current, parseInstancePath(path) ?? []),
      });
    });
    return Object.freeze(items);
  }

  private arrayFacade(arrayRid: RuntimeNodeId): ArrayInstance {
    const runtime = this;
    const facade: ArrayInstance = {
      get path() {
        runtime.assertLive(arrayRid);
        return runtime.bindings.pathOf(arrayRid) ?? ROOT_INSTANCE_PATH;
      },
      items() {
        runtime.assertLive(arrayRid);
        return runtime.snapshotsFor(arrayRid);
      },
      item(ref) {
        runtime.assertLive(arrayRid);
        const path = runtime.bindings.pathOf(arrayRid) ?? ROOT_INSTANCE_PATH;
        const index = runtime.kernel.resolveItemIndex(asKernelDraft(runtime.committedView()), arrayRid, ref, path);
        const order = runtime.arrays.arrays.get(arrayRid)?.order ?? [];
        const itemId = order[index];
        const itemRid = runtime.kernel.itemRuntimeId(asKernelDraft(runtime.committedView()), arrayRid, itemId!);
        if (itemRid === undefined) {
          runtime.throwDiagnostics([
            runtimeDiagnostic({
              code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_ARRAY_ITEM,
              message: "Array item id is unknown",
              metadata: { path },
            }),
          ]);
        }
        return runtime.scopeFacade(itemRid as RuntimeNodeId);
      },
      append(value) {
        runtime.assertLive(arrayRid);
        return runtime.dispatch({
          type: "arrayAppend",
          path: runtime.bindings.pathOf(arrayRid) ?? ROOT_INSTANCE_PATH,
          value,
        }) as ArrayItemId;
      },
      insert(index, value) {
        runtime.assertLive(arrayRid);
        return runtime.dispatch({
          type: "arrayInsert",
          path: runtime.bindings.pathOf(arrayRid) ?? ROOT_INSTANCE_PATH,
          index,
          value,
        }) as ArrayItemId;
      },
      remove(item) {
        runtime.assertLive(arrayRid);
        runtime.dispatch({
          type: "arrayRemove",
          path: runtime.bindings.pathOf(arrayRid) ?? ROOT_INSTANCE_PATH,
          item,
        });
      },
      move(from, to) {
        runtime.assertLive(arrayRid);
        runtime.dispatch({
          type: "arrayMove",
          path: runtime.bindings.pathOf(arrayRid) ?? ROOT_INSTANCE_PATH,
          from,
          to,
        });
      },
      setItemValue(item, value) {
        runtime.assertLive(arrayRid);
        runtime.dispatch({
          type: "arraySetItem",
          path: runtime.bindings.pathOf(arrayRid) ?? ROOT_INSTANCE_PATH,
          item,
          value,
        });
      },
      replaceItem(item, value) {
        runtime.assertLive(arrayRid);
        return runtime.dispatch({
          type: "arrayReplaceItem",
          path: runtime.bindings.pathOf(arrayRid) ?? ROOT_INSTANCE_PATH,
          item,
          value,
        }) as ArrayItemId;
      },
      clear() {
        runtime.assertLive(arrayRid);
        runtime.dispatch({
          type: "arrayClear",
          path: runtime.bindings.pathOf(arrayRid) ?? ROOT_INSTANCE_PATH,
        });
      },
    };
    bindRuntimeFacade(facade, runtime, arrayRid);
    return Object.freeze(facade);
  }

  private scopeFacade(runtimeId: RuntimeNodeId): ScopedFormInstance {
    const runtime = this;
    const facade: ScopedFormInstance = {
      get path() {
        runtime.assertLive(runtimeId);
        return runtime.bindings.pathOf(runtimeId) ?? ROOT_INSTANCE_PATH;
      },
      getValue(path) {
        runtime.assertLive(runtimeId);
        return runtime.getValue(joinRelativePath(runtime.bindings.pathOf(runtimeId) ?? ROOT_INSTANCE_PATH, path));
      },
      getField(path) {
        runtime.assertLive(runtimeId);
        return runtime.createField(joinRelativePath(runtime.bindings.pathOf(runtimeId) ?? ROOT_INSTANCE_PATH, path));
      },
      setValue(path, value) {
        runtime.assertLive(runtimeId);
        runtime.dispatch({
          type: "setValue",
          path: joinRelativePath(runtime.bindings.pathOf(runtimeId) ?? ROOT_INSTANCE_PATH, path),
          value,
        });
      },
      touch(path) {
        runtime.assertLive(runtimeId);
        runtime.dispatch({
          type: "touch",
          path: joinRelativePath(runtime.bindings.pathOf(runtimeId) ?? ROOT_INSTANCE_PATH, path),
        });
      },
      focus(viewId) {
        runtime.assertLive(runtimeId);
        runtime.dispatch({ type: "focus", viewId, scopeRuntimeId: runtimeId });
      },
      blur(viewId) {
        runtime.assertLive(runtimeId);
        runtime.dispatch({ type: "blur", viewId, scopeRuntimeId: runtimeId });
      },
      setCollapsed(viewId, collapsed) {
        runtime.assertLive(runtimeId);
        runtime.dispatch({ type: "setCollapsed", viewId, collapsed, scopeRuntimeId: runtimeId });
      },
      setActiveTab(viewId, tabKey) {
        runtime.assertLive(runtimeId);
        runtime.dispatch({ type: "setActiveTab", viewId, tabKey, scopeRuntimeId: runtimeId });
      },
      array(path) {
        runtime.assertLive(runtimeId);
        return runtime.createArray(joinRelativePath(runtime.bindings.pathOf(runtimeId) ?? ROOT_INSTANCE_PATH, path));
      },
      scope(path) {
        runtime.assertLive(runtimeId);
        return runtime.createScope(joinRelativePath(runtime.bindings.pathOf(runtimeId) ?? ROOT_INSTANCE_PATH, path));
      },
    };
    bindRuntimeFacade(facade, runtime, runtimeId);
    return Object.freeze(facade);
  }

  private assertLive(runtimeId: RuntimeNodeId): void {
    if (!this.bindings.records.has(runtimeId)) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.STALE_SCOPE,
          message: "Scoped facade is no longer bound to a live runtime entity",
        }),
      ]);
    }
  }

  requirementSource(path: ModelPath) {
    return requirementSourceOf(this.requirementIndex, path);
  }

  rootRuntimeId(): RuntimeNodeId {
    return this.kernel.internRoot(this.model.data.root);
  }

  assertScopeLive(runtimeId: RuntimeNodeId): void {
    this.assertLive(runtimeId);
  }

  projectInstanceBinding(runtimeId: RuntimeNodeId, previous?: InstanceBinding): InstanceBinding {
    const record = this.bindings.records.get(runtimeId);
    if (record === undefined) {
      if (previous !== undefined) {
        if (previous.stale) {
          return previous;
        }
        return Object.freeze({
          ...previous,
          stale: true,
        });
      }
      this.assertLive(runtimeId);
    }
    const path = this.bindings.pathOf(runtimeId) ?? previous?.path ?? ROOT_INSTANCE_PATH;
    const itemChain = this.bindings.itemChainOf(runtimeId);
    const next: InstanceBinding = Object.freeze({
      nodeId: record!.node.id,
      modelPath: record!.modelPath,
      path,
      itemId: itemChain[itemChain.length - 1],
      itemChain,
      stale: false,
    });
    const cached = this.bindingSnapshots.get(path);
    if (
      cached !== undefined &&
      cached.nodeId === next.nodeId &&
      cached.modelPath === next.modelPath &&
      cached.path === next.path &&
      cached.itemId === next.itemId &&
      cached.stale === next.stale &&
      sameItemChain(cached.itemChain, next.itemChain)
    ) {
      return cached;
    }
    this.bindingSnapshots.set(path, next);
    return next;
  }

  itemRuntimeIdInScope(
    runtimeId: RuntimeNodeId,
    ref: ArrayItemRef,
    arrayPath?: ModelPathLike,
  ): RuntimeNodeId {
    const draft = this.committedView();
    const arrayRid = this.resolveArrayRuntimeId(draft, runtimeId, arrayPath);
    const arrayInstancePath = this.bindings.pathOf(arrayRid) ?? ROOT_INSTANCE_PATH;
    const index = this.kernel.resolveItemIndex(asKernelDraft(draft), arrayRid, ref, arrayInstancePath);
    const order = this.arrays.arrays.get(arrayRid)?.order ?? [];
    const itemId = order[index];
    if (itemId === undefined) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_ARRAY_ITEM,
          message: "Array item id is unknown",
          metadata: { path: arrayInstancePath },
        }),
      ]);
    }
    const itemRid = this.kernel.itemRuntimeId(asKernelDraft(draft), arrayRid, itemId);
    if (itemRid === undefined) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_ARRAY_ITEM,
          message: "Array item id is unknown",
          metadata: { path: arrayInstancePath, item: String(itemId) },
        }),
      ]);
    }
    return itemRid;
  }

  scopeRuntimeIdInScope(runtimeId: RuntimeNodeId, path: ModelPathLike): RuntimeNodeId {
    const binding = this.projectInstanceBinding(runtimeId);
    const instance = this.resolveInScope(runtimeId, path);
    const child = this.bindings.idAt(instance);
    if (child === undefined) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH,
          message: `Cannot resolve RenderScope path without materializing: ${instance}`,
          metadata: { path: instance, modelPath: binding.modelPath },
        }),
      ]);
    }
    return child;
  }

  resolveInScope(runtimeId: RuntimeNodeId, path: ModelPathLike): InstancePath {
    return resolveModelPath(this, this.projectInstanceBinding(runtimeId), path);
  }

  private resolveArrayRuntimeId(
    draft: TransactionDraft,
    runtimeId: RuntimeNodeId,
    arrayPath?: ModelPathLike,
  ): RuntimeNodeId {
    if (arrayPath !== undefined) {
      const instance = this.resolveInScope(runtimeId, arrayPath);
      const array = this.kernel.requireArray(asKernelDraft(draft), instance);
      return array.runtimeId;
    }
    const record = draft.bindings.records.get(runtimeId);
    if (record !== undefined && derefNode(record.node, this.kernel.byId).kind === "array") {
      return runtimeId;
    }
    this.throwDiagnostics([
      runtimeDiagnostic({
        code: RUNTIME_DIAGNOSTIC_CODES.NON_ARRAY_PATH,
        message: "RenderScope.item() requires an array path",
        metadata: { path: draft.bindings.pathOf(runtimeId) },
      }),
    ]);
  }

  private viewsForInstance(path: InstancePath): readonly ViewNodeId[] {
    const modelPath = this.bindings.records.get(this.bindings.idAt(path) as RuntimeNodeId)?.modelPath ?? toModelPath(path);
    if (modelPath === undefined) {
      return [];
    }
    return this.viewsByField.get(modelPath) ?? [];
  }

  private applyArrayAppend(draft: TransactionDraft, path: InstancePathLike, value: unknown): void {
    const array = this.kernel.requireList(asKernelDraft(draft), path);
    const cloned = this.cloneValue(value, array.path);
    const current = asMutableArray(getJsonAt(draft.values, array.segments));
    current.push(cloned);
    this.writeArray(draft, array.segments, current);
    const id = draft.arrays.allocate();
    const order = [...(draft.arrays.arrays.get(array.runtimeId)?.order ?? []), id];
    draft.arrays.setOrder(array.runtimeId, order);
    const itemPath = joinInstancePath(array.path, { kind: "index", index: current.length - 1 });
    const template = array.node.items!;
    const itemRid = this.kernel.internItem(array.runtimeId, id, template);
    this.kernel.materializeTree(asKernelDraft(draft), template, itemRid, cloned, itemPath, array.runtimeId, id);
    draft.result = id;
    draft.identityChanged = true;
    draft.affectedArrayOrders.add(array.path);
    draft.affectedEntityValues.add(id);
  }

  private applyArrayInsert(draft: TransactionDraft, path: InstancePathLike, index: number, value: unknown): void {
    const array = this.kernel.requireList(asKernelDraft(draft), path);
    const current = asMutableArray(getJsonAt(draft.values, array.segments));
    if (!Number.isInteger(index) || index < 0 || index > current.length) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.ARRAY_INDEX_OUT_OF_RANGE,
          message: "Array insert index is out of range",
          metadata: { path: array.path, index },
        }),
      ]);
    }
    const cloned = this.cloneValue(value, array.path);
    current.splice(index, 0, cloned);
    this.writeArray(draft, array.segments, current);
    const id = draft.arrays.allocate();
    const order = [...(draft.arrays.arrays.get(array.runtimeId)?.order ?? [])];
    order.splice(index, 0, id);
    draft.arrays.setOrder(array.runtimeId, order);
    const template = array.node.items!;
    const itemRid = this.kernel.internItem(array.runtimeId, id, template);
    const itemPath = joinInstancePath(array.path, { kind: "index", index });
    this.kernel.materializeTree(asKernelDraft(draft), template, itemRid, cloned, itemPath, array.runtimeId, id);
    this.kernel.readdressArray(asKernelDraft(draft), array.runtimeId);
    draft.result = id;
    draft.identityChanged = true;
    draft.affectedArrayOrders.add(array.path);
  }

  private applyArrayRemove(draft: TransactionDraft, path: InstancePathLike, item: ArrayItemRef): void {
    const array = this.kernel.requireList(asKernelDraft(draft), path);
    const index = this.kernel.resolveItemIndex(asKernelDraft(draft), array.runtimeId, item, array.path);
    const order = [...(draft.arrays.arrays.get(array.runtimeId)?.order ?? [])];
    const itemId = order[index]!;
    const itemRid = this.kernel.itemRuntimeId(asKernelDraft(draft), array.runtimeId, itemId);
    if (itemRid !== undefined) {
      this.kernel.cleanupSubtree(asKernelDraft(draft), [itemRid], "remove");
      this.scrubRemovedViewState(draft);
    }
    const current = asMutableArray(getJsonAt(draft.values, array.segments));
    current.splice(index, 1);
    this.writeArray(draft, array.segments, current);
    order.splice(index, 1);
    draft.arrays.setOrder(array.runtimeId, order);
    this.kernel.readdressArray(asKernelDraft(draft), array.runtimeId);
    draft.identityChanged = true;
    draft.affectedArrayOrders.add(array.path);
  }

  private applyArrayMove(
    draft: TransactionDraft,
    path: InstancePathLike,
    from: ArrayItemRef,
    to: number,
  ): void {
    const array = this.kernel.requireList(asKernelDraft(draft), path);
    const fromIndex = this.kernel.resolveItemIndex(asKernelDraft(draft), array.runtimeId, from, array.path);
    const current = asMutableArray(getJsonAt(draft.values, array.segments));
    if (!Number.isInteger(to) || to < 0 || to >= current.length) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.ARRAY_INDEX_OUT_OF_RANGE,
          message: "Array move destination is out of range",
          metadata: { path: array.path, index: to },
        }),
      ]);
    }
    if (fromIndex === to) {
      return;
    }
    const order = [...(draft.arrays.arrays.get(array.runtimeId)?.order ?? [])];
    const [value] = current.splice(fromIndex, 1);
    const [itemId] = order.splice(fromIndex, 1);
    current.splice(to, 0, value!);
    order.splice(to, 0, itemId!);
    this.writeArray(draft, array.segments, current);
    draft.arrays.setOrder(array.runtimeId, order);
    this.kernel.readdressArray(asKernelDraft(draft), array.runtimeId);
    draft.identityChanged = true;
    draft.orderOnlyArrayPaths.add(array.path);
    draft.affectedArrayOrders.add(array.path);
    draft.valuesChanged = true;
  }

  private applyArraySetItem(
    draft: TransactionDraft,
    path: InstancePathLike,
    item: ArrayItemRef,
    value: unknown,
  ): void {
    const array = this.kernel.requireArray(asKernelDraft(draft), path);
    const index = this.kernel.resolveItemIndex(asKernelDraft(draft), array.runtimeId, item, array.path);
    const itemPath = joinInstancePath(array.path, { kind: "index", index });
    this.applySetValue(draft, itemPath, value);
    const order = draft.arrays.arrays.get(array.runtimeId)?.order ?? [];
    const itemId = order[index];
    if (itemId !== undefined) {
      draft.affectedEntityValues.add(itemId);
    }
  }

  private applyArrayReplaceItem(
    draft: TransactionDraft,
    path: InstancePathLike,
    item: ArrayItemRef,
    value: unknown,
  ): void {
    const array = this.kernel.requireArray(asKernelDraft(draft), path);
    const index = this.kernel.resolveItemIndex(asKernelDraft(draft), array.runtimeId, item, array.path);
    const order = [...(draft.arrays.arrays.get(array.runtimeId)?.order ?? [])];
    const oldId = order[index]!;
    const oldRid = this.kernel.itemRuntimeId(asKernelDraft(draft), array.runtimeId, oldId);
    if (oldRid !== undefined) {
      this.kernel.cleanupSubtree(asKernelDraft(draft), [oldRid], "replace");
      this.scrubRemovedViewState(draft);
    }
    const cloned = this.cloneValue(value, array.path);
    const current = asMutableArray(getJsonAt(draft.values, array.segments));
    current[index] = cloned;
    this.writeArray(draft, array.segments, current);
    const newId = draft.arrays.allocate();
    order[index] = newId;
    draft.arrays.setOrder(array.runtimeId, order);
    const template = array.node.items ?? array.node.prefixItems?.[index];
    if (template === undefined) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.ARRAY_TEMPLATE_MISSING,
          message: "Array index does not map to a compiled item template",
          metadata: { path: array.path, index },
        }),
      ]);
    }
    const itemPath = joinInstancePath(array.path, { kind: "index", index });
    const itemRid = this.kernel.internItem(array.runtimeId, newId, template);
    this.kernel.materializeTree(asKernelDraft(draft), template, itemRid, cloned, itemPath, array.runtimeId, newId);
    draft.result = newId;
    draft.identityChanged = true;
    draft.affectedArrayOrders.add(array.path);
  }

  private applyArrayClear(draft: TransactionDraft, path: InstancePathLike): void {
    const array = this.kernel.requireList(asKernelDraft(draft), path);
    const order = [...(draft.arrays.arrays.get(array.runtimeId)?.order ?? [])];
    for (const itemId of order) {
      const itemRid = this.kernel.itemRuntimeId(asKernelDraft(draft), array.runtimeId, itemId);
      if (itemRid !== undefined) {
        this.kernel.cleanupSubtree(asKernelDraft(draft), [itemRid], "clear");
      }
    }
    this.scrubRemovedViewState(draft);
    this.writeArray(draft, array.segments, []);
    draft.arrays.setOrder(array.runtimeId, []);
    draft.identityChanged = true;
    draft.affectedArrayOrders.add(array.path);
  }

  private writeArray(draft: TransactionDraft, segments: readonly { kind: string; name?: string; index?: number }[], next: JsonValue[]): void {
    const frozen = Object.freeze([...next]) as JsonValue;
    const updated = setJsonPath(draft.values, segments as never, frozen, (prefix) =>
      canMaterializeObject(this.model, prefix),
    );
    if (!updated.ok) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH,
          message: "Cannot write array value",
        }),
      ]);
    }
    draft.values = updated.value;
    draft.valuesChanged = true;
  }
}

function readInitialValues(model: CompiledFormModel, initialValues: unknown): JsonValue {
  if (initialValues === undefined) {
    if (model.data.root.kind === "array") {
      return cloneJsonValue([]);
    }
    if (model.data.root.kind === "scalar") {
      return null;
    }
    return cloneJsonValue({});
  }
  try {
    return cloneJsonValue(initialValues);
  } catch (error) {
    const reason = error instanceof JsonCloneError ? error.reason : "non-json";
    throw new FormRuntimeError([
      runtimeDiagnostic({
        code: RUNTIME_DIAGNOSTIC_CODES.INVALID_VALUE,
        message: "initialValues is not a JSON-compatible snapshot",
        metadata: { reason },
      }),
    ]);
  }
}

function draftDiffers(
  draft: TransactionDraft,
  values: JsonValue,
  touched: ReadonlyMap<string, true>,
  focused: ReadonlyMap<string, true>,
  collapsed: ReadonlyMap<string, true>,
  activeTab: ReadonlyMap<string, string>,
): boolean {
  return (
    !jsonEqual(draft.values, values) ||
    !mapsEqual(draft.touched, touched) ||
    !mapsEqual(draft.focused, focused) ||
    !mapsEqual(draft.collapsed, collapsed) ||
    !stringMapsEqual(draft.activeTab, activeTab)
  );
}

function mapsEqual(left: ReadonlyMap<string, true>, right: ReadonlyMap<string, true>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const key of left.keys()) {
    if (!right.has(key)) {
      return false;
    }
  }
  return true;
}

function stringMapsEqual(left: ReadonlyMap<string, string>, right: ReadonlyMap<string, string>): boolean {
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

function uniqueTouchedIds(
  committed: ReadonlyMap<string, true>,
  draft: ReadonlyMap<string, true>,
): string[] {
  const ids: string[] = [];
  for (const key of new Set([...committed.keys(), ...draft.keys()])) {
    if (Boolean(committed.get(key)) !== Boolean(draft.get(key))) {
      ids.push(key);
    }
  }
  return ids;
}

function uniqueFocused(
  committed: ReadonlyMap<string, true>,
  draft: ReadonlyMap<string, true>,
): ViewNodeId[] {
  const ids: ViewNodeId[] = [];
  for (const key of new Set([...committed.keys(), ...draft.keys()])) {
    if (Boolean(committed.get(key)) !== Boolean(draft.get(key))) {
      ids.push(key as ViewNodeId);
    }
  }
  return ids;
}

function uniqueViewState(
  committedFocused: ReadonlyMap<string, true>,
  draftFocused: ReadonlyMap<string, true>,
  committedCollapsed: ReadonlyMap<string, true>,
  draftCollapsed: ReadonlyMap<string, true>,
  committedActiveTab: ReadonlyMap<string, string>,
  draftActiveTab: ReadonlyMap<string, string>,
): ViewNodeId[] {
  const ids = new Set<ViewNodeId>(uniqueFocused(committedFocused, draftFocused));
  for (const key of new Set([...committedCollapsed.keys(), ...draftCollapsed.keys()])) {
    if (Boolean(committedCollapsed.get(key)) !== Boolean(draftCollapsed.get(key))) {
      ids.add(key as ViewNodeId);
    }
  }
  for (const key of new Set([...committedActiveTab.keys(), ...draftActiveTab.keys()])) {
    if (committedActiveTab.get(key) !== draftActiveTab.get(key)) {
      ids.add(key as ViewNodeId);
    }
  }
  return [...ids];
}

function isUnderInstancePath(path: InstancePath, ancestor: InstancePath): boolean {
  if (ancestor === ROOT_INSTANCE_PATH) {
    return path !== ROOT_INSTANCE_PATH;
  }
  return path.startsWith(`${ancestor}.`) || path.startsWith(`${ancestor}[`);
}

function affectedDependencyKeys(changeSet: NormalizedChangeSet, extra: ReadonlySet<string> = new Set()): Set<string> {
  const keys = new Set<string>(["form", ...extra]);
  for (const path of changeSet.valuePaths) {
    keys.add(`value:${path}`);
  }
  for (const path of changeSet.fieldPaths) {
    keys.add(`field:${path}`);
  }
  for (const id of changeSet.viewIds) {
    keys.add(`view:${id}`);
  }
  return keys;
}

function intersects(deps: readonly string[], affected: ReadonlySet<string>): boolean {
  return deps.some((dep) => affected.has(dep));
}

function indexViews(node: UIViewNode, map = new Map<string, UIViewNode>()): ReadonlyMap<string, UIViewNode> {
  map.set(node.id, node);
  if ("children" in node && node.children !== undefined) {
    for (const child of node.children) {
      indexViews(child, map);
    }
  }
  if ("itemLayout" in node && node.itemLayout !== undefined) {
    for (const child of node.itemLayout) {
      indexViews(child, map);
    }
  }
  return map;
}

function indexFieldViews(node: UIViewNode, map: Map<string, ViewNodeId[]>): void {
  if (node.kind === "field") {
    const list = map.get(node.fieldPath) ?? [];
    list.push(node.id);
    map.set(node.fieldPath, list);
  }
  if ("children" in node && node.children !== undefined) {
    for (const child of node.children) {
      indexFieldViews(child, map);
    }
  }
  if ("itemLayout" in node && node.itemLayout !== undefined) {
    for (const child of node.itemLayout) {
      indexFieldViews(child, map);
    }
  }
}

function viewTemplatePath(node: UIViewNode | undefined): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (node.kind === "field") {
    return node.fieldPath;
  }
  if ("path" in node && typeof node.path === "string") {
    return node.path;
  }
  return undefined;
}

function sameItemChain(left: readonly ArrayItemId[], right: readonly ArrayItemId[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => item === right[index]);
}

function limitDiagnostic(
  commandCount: number,
  iterationCount: number,
  commandLimit: number,
  iterationLimit: number,
): Diagnostic {
  return runtimeDiagnostic({
    code: RUNTIME_DIAGNOSTIC_CODES.TRANSACTION_LIMIT,
    message: "Runtime transaction did not converge",
    metadata: { commandCount, iterationCount, commandLimit, iterationLimit },
  });
}

function normalizeThrown(phase: string, error: unknown): Diagnostic {
  return runtimeDiagnostic({
    code: RUNTIME_DIAGNOSTIC_CODES.PHASE_FAILED,
    severity: "warning",
    message: "Selector evaluation threw",
    metadata: { phase, reason: error instanceof Error ? error.message : "unknown" },
  });
}

let instanceNonce = 0;

function nextInstanceNonce(): string {
  instanceNonce += 1;
  return String(instanceNonce);
}

function arrayItemCount(store: ArrayStateStore): number {
  let count = 0;
  for (const record of store.arrays.values()) {
    count += record.order.length;
  }
  return count;
}

function asMutableArray(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? [...value] : [];
}

function asKernelDraft(draft: TransactionDraft): ArrayKernelDraft {
  return draft;
}

function emptyKernelDraft(values: JsonValue, arrays: ArrayStateStore, bindings: BindingIndex): ArrayKernelDraft {
  return {
    values,
    arrays,
    bindings,
    touched: new Map(),
    focused: new Map(),
    identityChanged: false,
    orderOnlyArrayPaths: new Set(),
    affectedEntityValues: new Set(),
    affectedAddresses: new Set(),
    affectedArrayOrders: new Set(),
    removedRuntimeIds: [],
    abortEffects: [],
    generationInvalidations: [],
  };
}

function freezeResolvers(
  model: CompiledFormModel,
  bindings: readonly { readonly path: string; readonly resolve: ArrayIdentityResolver }[] | undefined,
): ReadonlyMap<string, ArrayIdentityResolver> {
  const resolvers = new Map<string, ArrayIdentityResolver>();
  if (bindings === undefined) {
    return resolvers;
  }
  const seen = new Set<string>();
  for (const binding of bindings) {
    const canonical = toModelPath(binding.path);
    if (canonical === undefined) {
      throw new FormRuntimeError(
        sortRuntimeDiagnostics([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.IDENTITY_RESOLVER_INVALID,
            message: "Array identity resolver path is not a canonical ModelPath",
            metadata: { path: binding.path },
          }),
        ]),
      );
    }
    if (seen.has(canonical)) {
      throw new FormRuntimeError(
        sortRuntimeDiagnostics([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.IDENTITY_RESOLVER_INVALID,
            message: "Array identity resolver path is duplicated",
            metadata: { path: canonical },
          }),
        ]),
      );
    }
    seen.add(canonical);
    const node = model.data.nodes.get(canonical) ?? (canonical === "" ? model.data.root : undefined);
    if (node === undefined || derefNode(node, indexDataNodes(model)).kind !== "array") {
      throw new FormRuntimeError(
        sortRuntimeDiagnostics([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.IDENTITY_RESOLVER_INVALID,
            message: "Array identity resolver path does not identify an array",
            metadata: { path: canonical },
          }),
        ]),
      );
    }
    const resolve = binding.resolve;
    resolvers.set(canonical, (item) => resolve(item));
  }
  return resolvers;
}
