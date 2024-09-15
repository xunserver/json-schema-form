import type { Diagnostic } from "../diagnostic/index.js";
import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { FormEnvironment } from "../extension/environment.js";
import type { ArrayItemId, ViewNodeId } from "../identity/index.js";
import type { ViewNode as UIViewNode } from "../model/ui.js";
import {
  formatInstancePath,
  instancePathAncestors,
  joinInstancePath,
  parseInstancePath,
  ROOT_INSTANCE_PATH,
  toModelPath,
  type InstancePath,
  type InstancePathLike,
} from "../path/index.js";
import type {
  ArrayInstance,
  ArrayItemRef,
  ArrayItemSnapshot,
  FieldInstance,
  FieldSnapshot,
  FormInstance,
  FormSnapshot,
  JsonValue,
  ScopedFormInstance,
  ViewSnapshot,
} from "./contracts.js";
import { canMaterializeObject, isFieldPath } from "./binding.js";
import { ChangeQueue, type RuntimeCommand, type RuntimeCommandResult, type TransactionDraft } from "./commands.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { runtimeDiagnostic, sortRuntimeDiagnostics } from "./diagnostics.js";
import { FormRuntimeError } from "./error.js";
import {
  cloneJsonValue,
  diffJsonValuePaths,
  getJsonAt,
  jsonEqual,
  JsonCloneError,
  reuseEqualBranches,
  setJsonPath,
} from "./json-value.js";
import {
  freezePhaseSet,
  RUNTIME_COMMAND_LIMIT,
  RUNTIME_ITERATION_LIMIT,
  type NormalizedChangeSet,
  type PhaseSet,
  type TransactionPhaseContext,
} from "./phases.js";
import {
  getSelectorRecord,
  isRuntimeSelector,
  type RuntimeDiagnosticEvent,
  type RuntimeSelector,
  type SelectorHost,
  type Unsubscribe,
} from "./selectors.js";
import {
  EffectScheduler,
  FieldStateStore,
  FormStateStore,
  NodeStateStore,
  ValueStoreImpl,
  ViewStateStore,
} from "./stores.js";
import { ArrayStateStore } from "./array-store.js";
import { BindingIndex } from "./binding-index.js";
import { ArrayKernel, joinRelativePath, type ArrayKernelDraft } from "./array-kernel.js";
import { RuntimeNodeInterner, type RuntimeNodeId } from "./runtime-node-id.js";
import { derefNode, indexDataNodes } from "./templates.js";
import type { ArrayIdentityResolver } from "./identity-resolver.js";
import type { RuntimeSubtreeOwner } from "./subtree-lifecycle.js";
import { freezeBindingView } from "./subtree-lifecycle.js";

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
  lastCommandResult: RuntimeCommandResult = undefined;
  ownerGenerations = new Map<string, number>();

  private extraSelectorKeys = new Set<string>();
  private readonly phases: PhaseSet;
  private readonly commandLimit: number;
  private readonly iterationLimit: number;
  private readonly viewIndex: ReadonlyMap<string, UIViewNode>;
  private readonly fieldSnapshots = new Map<string, FieldSnapshot>();
  private readonly viewSnapshots = new Map<string, ViewSnapshot>();
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

  constructor(model: CompiledFormModel, environment: FormEnvironment, options?: FormRuntimeOptions) {
    this.model = model;
    this.environment = environment;
    this.phases = freezePhaseSet(options?.phases);
    this.commandLimit = options?.commandLimit ?? RUNTIME_COMMAND_LIMIT;
    this.iterationLimit = options?.iterationLimit ?? RUNTIME_ITERATION_LIMIT;
    this.viewIndex = indexViews(model.ui.viewTree);
    this.values = new ValueStoreImpl(readInitialValues(model, options?.initialValues));
    this.arrays = new ArrayStateStore(`f${nextInstanceNonce()}`);
    this.kernel = new ArrayKernel(
      model,
      indexDataNodes(model),
      this.interner,
      freezeResolvers(model, options?.arrayIdentityResolvers),
      options?.subtreeOwners ?? [],
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
    const snapshot: FormSnapshot = Object.freeze({
      values: this.values.current,
      dirty: !jsonEqual(this.values.current, this.values.initial),
      touched: this.fields.touched.size > 0,
      version: this.form.version,
    });
    this.cachedFormSnapshot = snapshot;
    this.formSnapshotStamp = stamp;
    return snapshot;
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
    const draft = this.createDraft();
    let committedChangeSet: NormalizedChangeSet | undefined;
    const queue = new ChangeQueue();
    for (const command of commands) {
      queue.enqueue(command);
    }

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
        }
      };

      applyQueued();
      if (!draftDiffers(draft, originalValues, originalTouched, originalFocused) && !draft.identityChanged) {
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
        this.runPhase("activation", draft, queue, committedVersion, originalValues, originalTouched, originalFocused);
        applyQueued();
        this.runPhase("rule", draft, queue, committedVersion, originalValues, originalTouched, originalFocused);
        applyQueued();
        progressed = draftDiffers(draft, beforeValues, beforeTouched, beforeFocused);
      }

      this.runPhase(
        "syncValidation",
        draft,
        queue,
        committedVersion,
        originalValues,
        originalTouched,
        originalFocused,
      );
      if (queue.size > 0) {
        this.throwDiagnostics([
          runtimeDiagnostic({
            code: RUNTIME_DIAGNOSTIC_CODES.INVALID_COMMAND,
            message: "sync validation cannot enqueue commands into the current transaction",
          }),
        ]);
      }

      if (!draftDiffers(draft, originalValues, originalTouched, originalFocused) && !draft.identityChanged) {
        return;
      }

      committedChangeSet = this.changeSetOf(draft, originalValues, originalTouched, originalFocused);
      this.commitDraft(draft, committedChangeSet);
      this.lastCommandResult = draft.result;
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
          reset: committedChangeSet.reset,
          valuesChanged: false,
          touchChanged: false,
          focusChanged: false,
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
      reset: false,
      valuesChanged: false,
      touchChanged: false,
      focusChanged: false,
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
        this.applyFocus(draft, command.viewId);
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

  private applyFocus(draft: TransactionDraft, viewId: ViewNodeId): void {
    if (!this.viewIndex.has(viewId)) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_VIEW,
          message: `Unknown ViewNodeId: ${viewId}`,
          metadata: { viewId },
        }),
      ]);
    }
    if (draft.focused.has(viewId)) {
      return;
    }
    draft.focused.set(viewId, true);
    draft.focusChanged = true;
  }

  private applyReset(draft: TransactionDraft): void {
    const valuesChanged = !jsonEqual(draft.values, this.values.initial);
    const touchChanged = draft.touched.size > 0;
    const focusChanged = draft.focused.size > 0;
    const hadItems = arrayItemCount(draft.arrays) > 0 || arrayItemCount(this.arrays) > 0;
    if (!valuesChanged && !touchChanged && !focusChanged && !hadItems) {
      return;
    }
    draft.values = this.values.initial;
    draft.touched.clear();
    draft.focused.clear();
    draft.reset = true;
    draft.valuesChanged = valuesChanged || draft.valuesChanged;
    draft.touchChanged = touchChanged || draft.touchChanged;
    draft.focusChanged = focusChanged || draft.focusChanged;
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
    this.form.version += 1;
    this.form.revision += 1;
    this.extraSelectorKeys = new Set();
    for (const path of draft.affectedArrayOrders) {
      this.extraSelectorKeys.add(`array-order:${path}`);
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
  ): void {
    const context: TransactionPhaseContext = Object.freeze({
      phase,
      committedVersion,
      changeSet: this.changeSetOf(draft, originalValues, originalTouched, originalFocused),
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
      },
    });
    try {
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
    const viewIds = uniqueFocused(committedFocused, draft.focused);
    return Object.freeze({
      valuePaths: Object.freeze([...valuePaths]),
      fieldPaths: Object.freeze([...fieldPaths]),
      viewIds: Object.freeze(viewIds),
      reset: draft.reset,
    });
  }

  private fieldSnapshotAt(path: InstancePath): FieldSnapshot {
    const value = getJsonAt(this.values.current, parseInstancePath(path) ?? []);
    const initial = getJsonAt(this.values.initial, parseInstancePath(path) ?? []);
    const dirty = !jsonEqual(value, initial);
    const touched = this.isAggregateTouched(path);
    const cached = this.fieldSnapshots.get(path);
    if (
      cached !== undefined &&
      Object.is(cached.value, value) &&
      cached.dirty === dirty &&
      cached.touched === touched
    ) {
      return cached;
    }
    const snapshot: FieldSnapshot = Object.freeze({
      path,
      value,
      dirty,
      touched,
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
    const cached = this.viewSnapshots.get(id);
    if (cached !== undefined && cached.focused === focused) {
      return cached;
    }
    const snapshot: ViewSnapshot = Object.freeze({
      id,
      focused,
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
      reset: false,
      valuesChanged: false,
      touchChanged: false,
      focusChanged: false,
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
    return `${this.values.revision}:${this.fields.revision}:${this.views.revision}:${this.form.revision}`;
  }

  private throwDiagnostics(diagnostics: readonly Diagnostic[]): never {
    throw new FormRuntimeError(sortRuntimeDiagnostics(diagnostics));
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
      reset() {
        runtime.dispatch({ type: "reset" });
      },
      array(path) {
        return runtime.createArray(path);
      },
      scope(path) {
        return runtime.createScope(path);
      },
    };
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
    const record = this.bindings.records.get(binding.runtimeId);
    return Object.freeze({
      path: this.bindings.pathOf(binding.runtimeId) ?? binding.path,
      itemId: record?.itemId,
    });
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
        runtime.dispatch({ type: "focus", viewId });
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
): boolean {
  return !jsonEqual(draft.values, values) || !mapsEqual(draft.touched, touched) || !mapsEqual(draft.focused, focused);
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

function isAggregateTouched(path: InstancePath, touched: ReadonlyMap<string, true>): boolean {
  if (touched.has(path)) {
    return true;
  }
  for (const candidate of touched.keys()) {
    if (candidate === path || (path === ROOT_INSTANCE_PATH && candidate.length > 0)) {
      return true;
    }
    if (path !== ROOT_INSTANCE_PATH && (candidate === path || candidate.startsWith(`${path}.`) || candidate.startsWith(`${path}[`))) {
      return true;
    }
  }
  return false;
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
