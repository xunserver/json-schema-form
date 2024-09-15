import type { Diagnostic } from "../diagnostic/index.js";
import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { FormEnvironment } from "../extension/environment.js";
import type { ViewNodeId } from "../identity/index.js";
import type { ViewNode as UIViewNode } from "../model/ui.js";
import {
  formatInstancePath,
  instancePathAncestors,
  parseInstancePath,
  ROOT_INSTANCE_PATH,
  type InstancePath,
  type InstancePathLike,
} from "../path/index.js";
import type {
  FieldInstance,
  FieldSnapshot,
  FormInstance,
  FormSnapshot,
  JsonValue,
  ViewSnapshot,
} from "./contracts.js";
import { bindInstancePath, canMaterializeObject, isFieldPath } from "./binding.js";
import { ChangeQueue, type RuntimeCommand, type TransactionDraft } from "./commands.js";
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

export interface FormRuntimeOptions {
  readonly initialValues?: unknown;
  readonly phases?: Partial<PhaseSet>;
  readonly commandLimit?: number;
  readonly iterationLimit?: number;
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

  dispatch(command: RuntimeCommand): void {
    this.runtime.dispatch(command);
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
    this.transaction = new TransactionManager(this);
    this.facade = this.createFacade();
  }

  dispatch(command: RuntimeCommand): void {
    if (this.running || this.publishing) {
      this.pending.enqueue(command);
      return;
    }
    this.runTransaction([command]);
    this.drainPending();
  }

  getValue(path: InstancePathLike): JsonValue | undefined {
    const binding = this.requireBinding(path);
    return getJsonAt(this.values.current, binding.segments);
  }

  getValues(): JsonValue {
    return this.values.current;
  }

  fieldSnapshot(path: InstancePathLike): FieldSnapshot {
    const binding = this.requireBinding(path);
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
      if (!draftDiffers(draft, originalValues, originalTouched, originalFocused)) {
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

      if (!draftDiffers(draft, originalValues, originalTouched, originalFocused)) {
        return;
      }

      committedChangeSet = this.changeSetOf(draft, originalValues, originalTouched, originalFocused);
      this.commitDraft(draft, committedChangeSet);
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
      default: {
        const exhaustive: never = command;
        void exhaustive;
      }
    }
  }

  private applySetValue(draft: TransactionDraft, path: InstancePathLike, value: unknown): void {
    const binding = this.requireBinding(path);
    const cloned = this.cloneValue(value, binding.path);
    const updated = setJsonPath(draft.values, binding.segments, cloned, (prefix) =>
      canMaterializeObject(this.model, prefix),
    );
    if (!updated.ok) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code:
            updated.reason === "index-write"
              ? RUNTIME_DIAGNOSTIC_CODES.ARRAY_BINDING_UNAVAILABLE
              : RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH,
          message:
            updated.reason === "index-write"
              ? "Array indexes cannot be materialized by setValue()"
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
  }

  private applySetValues(draft: TransactionDraft, value: unknown): void {
    const cloned = this.cloneValue(value, ROOT_INSTANCE_PATH);
    const next = reuseEqualBranches(draft.values, cloned);
    if (jsonEqual(draft.values, next)) {
      return;
    }
    draft.values = next;
    draft.valuesChanged = true;
  }

  private applyTouch(draft: TransactionDraft, path: InstancePathLike): void {
    const binding = this.requireBinding(path);
    if (!isFieldPath(this.model, binding.path)) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_FIELD,
          message: `InstancePath is not a Field: ${binding.path}`,
          metadata: { path: binding.path },
        }),
      ]);
    }
    if (draft.touched.has(binding.path)) {
      return;
    }
    draft.touched.set(binding.path, true);
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
    if (!valuesChanged && !touchChanged && !focusChanged) {
      return;
    }
    draft.values = this.values.initial;
    draft.touched.clear();
    draft.focused.clear();
    draft.reset = true;
    draft.valuesChanged = valuesChanged || draft.valuesChanged;
    draft.touchChanged = touchChanged || draft.touchChanged;
    draft.focusChanged = focusChanged || draft.focusChanged;
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
    const affected = affectedDependencyKeys(changeSet);
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
    for (const path of uniqueTouched(committedTouched, draft.touched)) {
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
    const touched = isAggregateTouched(path, this.fields.touched);
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

  private requireBinding(path: InstancePathLike) {
    const result = bindInstancePath(this.model, path);
    if (!result.ok) {
      this.throwDiagnostics([
        runtimeDiagnostic({
          code: result.failure.code,
          message: result.failure.message,
          ...(result.failure.path === undefined ? {} : { metadata: { path: result.failure.path } }),
        }),
      ]);
    }
    return result.binding;
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
    };
    return Object.freeze(facade);
  }

  private createField(path: InstancePathLike): FieldInstance {
    const binding = this.requireBinding(path);
    const runtime = this;
    const field: FieldInstance = {
      path: binding.path,
      getValue() {
        return runtime.getValue(binding.path);
      },
      getState() {
        return runtime.fieldSnapshotAt(binding.path);
      },
      setValue(value) {
        runtime.dispatch({ type: "setValue", path: binding.path, value });
      },
      touch() {
        runtime.dispatch({ type: "touch", path: binding.path });
      },
    };
    return Object.freeze(field);
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

function uniqueTouched(
  committed: ReadonlyMap<string, true>,
  draft: ReadonlyMap<string, true>,
): InstancePath[] {
  const paths: InstancePath[] = [];
  for (const key of new Set([...committed.keys(), ...draft.keys()])) {
    if (Boolean(committed.get(key)) !== Boolean(draft.get(key))) {
      paths.push(key as InstancePath);
    }
  }
  return paths;
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

function affectedDependencyKeys(changeSet: NormalizedChangeSet): Set<string> {
  const keys = new Set<string>(["form"]);
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
