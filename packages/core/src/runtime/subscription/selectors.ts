import type { ArrayItemId, ViewNodeId } from "../../model/identity/index.js";
import type { InstancePathLike } from "../../model/path/types.js";
import { toInstancePath } from "../../model/path/instance-path.js";
import type {
  ArrayItemRef,
  ArrayItemSnapshot,
  CurrentBindingSnapshot,
  FieldSnapshot,
  FormSnapshot,
  JsonValue,
  ViewSnapshot,
} from "../form/contracts.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import { runtimeDiagnostic } from "../diagnostics.js";
import { FormRuntimeError } from "../error.js";

declare const runtimeSelectorBrand: unique symbol;

export interface RuntimeSelector<T> {
  readonly [runtimeSelectorBrand]: T;
}

export interface SelectorHost {
  getValue(path: InstancePathLike): JsonValue | undefined;
  getValues(): JsonValue;
  fieldSnapshot(path: InstancePathLike): FieldSnapshot;
  viewSnapshot(id: ViewNodeId): ViewSnapshot;
  formSnapshot(): FormSnapshot;
  presentableErrors(path: InstancePathLike): readonly import("../../validation/error.js").ValidationError[];
  evaluateSelector<T>(selector: RuntimeSelector<T>): T;
  arrayOrder(path: InstancePathLike): readonly ArrayItemId[];
  arrayItemSnapshot(path: InstancePathLike, item: ArrayItemRef): ArrayItemSnapshot;
  currentBinding(path: InstancePathLike): CurrentBindingSnapshot;
  itemValue(itemId: ArrayItemId, relative?: InstancePathLike): JsonValue | undefined;
  itemPath(itemId: ArrayItemId): import("../../model/path/types.js").InstancePath;
}

export interface SelectorRecord<T> {
  readonly deps: readonly string[];
  readonly project: (host: SelectorHost) => T;
}

const RECORDS = new WeakMap<RuntimeSelector<unknown>, SelectorRecord<unknown>>();

export function getSelectorRecord<T>(selector: RuntimeSelector<T>): SelectorRecord<T> | undefined {
  return RECORDS.get(selector) as SelectorRecord<T> | undefined;
}

export function isRuntimeSelector(value: unknown): value is RuntimeSelector<unknown> {
  return typeof value === "object" && value !== null && RECORDS.has(value as RuntimeSelector<unknown>);
}

function makeSelector<T>(record: SelectorRecord<T>): RuntimeSelector<T> {
  const selector = Object.freeze({}) as RuntimeSelector<T>;
  RECORDS.set(selector, record);
  return selector;
}

function requireCanonicalPath(path: InstancePathLike, kind: string): string {
  const canonical = toInstancePath(path);
  if (canonical === undefined) {
    throw new FormRuntimeError([
      runtimeDiagnostic({
        code: RUNTIME_DIAGNOSTIC_CODES.INVALID_PATH,
        message: `Invalid ${kind} selector path: ${String(path)}`,
        metadata: { path: String(path) },
      }),
    ]);
  }
  return canonical;
}

export function valueSelector(path: InstancePathLike): RuntimeSelector<JsonValue | undefined> {
  const canonical = requireCanonicalPath(path, "value");
  return makeSelector({
    deps: Object.freeze([`value:${canonical}`]),
    project: (host) => host.getValue(canonical),
  });
}

export function fieldSelector(path: InstancePathLike): RuntimeSelector<FieldSnapshot> {
  const canonical = requireCanonicalPath(path, "field");
  return makeSelector({
    deps: Object.freeze([`value:${canonical}`, `field:${canonical}`, `effective:${canonical}`, `validation:${canonical}`]),
    project: (host) => host.fieldSnapshot(canonical),
  });
}

export function viewSelector(id: ViewNodeId): RuntimeSelector<ViewSnapshot> {
  return makeSelector({
    deps: Object.freeze([`view:${id}`]),
    project: (host) => host.viewSnapshot(id),
  });
}

export function formSelector(): RuntimeSelector<FormSnapshot> {
  return makeSelector({
    deps: Object.freeze(["form"]),
    project: (host) => host.formSnapshot(),
  });
}

export function presentableErrorSelector(path?: InstancePathLike): RuntimeSelector<readonly import("../../validation/error.js").ValidationError[]> {
  const canonical = path === undefined ? "" : requireCanonicalPath(path, "presentable");
  return makeSelector({
    deps: Object.freeze(canonical === "" ? ["form"] : [`validation:${canonical}`, `field:${canonical}`, "form"]),
    project: (host) => host.presentableErrors(canonical),
  });
}

const EFFECTIVE_FROM_FIELD = new WeakMap<FieldSnapshot, import("../form/contracts.js").EffectiveState>();

export function effectiveStateSelector(path: InstancePathLike): RuntimeSelector<import("../form/contracts.js").EffectiveState> {
  const canonical = requireCanonicalPath(path, "effective");
  return makeSelector({
    deps: Object.freeze([`effective:${canonical}`]),
    project: (host) => {
      const snapshot = host.fieldSnapshot(canonical);
      const cached = EFFECTIVE_FROM_FIELD.get(snapshot);
      if (cached !== undefined) {
        return cached;
      }
      const next = Object.freeze({
        active: snapshot.active,
        visible: snapshot.visible,
        disabled: snapshot.disabled,
        readonly: snapshot.readonly,
        required: snapshot.required,
      });
      EFFECTIVE_FROM_FIELD.set(snapshot, next);
      return next;
    },
  });
}

export function arrayOrderSelector(path: InstancePathLike): RuntimeSelector<readonly ArrayItemId[]> {
  const canonical = requireCanonicalPath(path, "array order");
  return makeSelector({
    deps: Object.freeze([`array-order:${canonical}`]),
    project: (host) => host.arrayOrder(canonical),
  });
}

export function arrayItemSelector(
  path: InstancePathLike,
  item: ArrayItemRef,
): RuntimeSelector<ArrayItemSnapshot> {
  const canonical = requireCanonicalPath(path, "array item");
  const itemKey = typeof item === "number" ? String(item) : String(item);
  return makeSelector({
    deps: Object.freeze(
      typeof item === "number"
        ? [`array-order:${canonical}`, `value:${canonical}`]
        : [`entity-value:${itemKey}`, `address:${itemKey}`],
    ),
    project: (host) => host.arrayItemSnapshot(canonical, item),
  });
}

export function currentBindingSelector(path: InstancePathLike): RuntimeSelector<CurrentBindingSnapshot> {
  const canonical = requireCanonicalPath(path, "binding");
  return makeSelector({
    deps: Object.freeze([`binding:${canonical}`]),
    project: (host) => host.currentBinding(canonical),
  });
}

export function itemValueSelector(
  itemId: ArrayItemId,
  relative?: InstancePathLike,
): RuntimeSelector<JsonValue | undefined> {
  return makeSelector({
    deps: Object.freeze([`entity-value:${itemId}`]),
    project: (host) => host.itemValue(itemId, relative),
  });
}

export function itemPathSelector(itemId: ArrayItemId): RuntimeSelector<import("../../model/path/types.js").InstancePath> {
  return makeSelector({
    deps: Object.freeze([`address:${itemId}`]),
    project: (host) => host.itemPath(itemId),
  });
}

export function createSelector<const I extends readonly RuntimeSelector<unknown>[], T>(
  inputs: I,
  projector: (...values: { [K in keyof I]: I[K] extends RuntimeSelector<infer R> ? R : never }) => T,
): RuntimeSelector<T> {
  const records: SelectorRecord<unknown>[] = [];
  const deps: string[] = [];
  for (const input of inputs) {
    const record = getSelectorRecord(input);
    if (record === undefined) {
      throw new FormRuntimeError([
        runtimeDiagnostic({
          code: RUNTIME_DIAGNOSTIC_CODES.INVALID_SELECTOR,
          message: "createSelector() only accepts selectors created by the runtime API",
        }),
      ]);
    }
    records.push(record);
    for (const dep of record.deps) {
      if (!deps.includes(dep)) {
        deps.push(dep);
      }
    }
  }

  const frozenInputs = [...inputs];
  return makeSelector({
    deps: Object.freeze(deps),
    project: (host) => {
      const values = frozenInputs.map((input) => host.evaluateSelector(input));
      return freezeSelectorResult(projector(...(values as never)));
    },
  });
}

export type Unsubscribe = () => void;

export interface RuntimeDiagnosticEvent {
  readonly diagnostics: readonly import("../../diagnostic/index.js").Diagnostic[];
  readonly version: number;
}

function freezeSelectorResult<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    return Object.freeze(value) as T;
  }
  return value;
}
