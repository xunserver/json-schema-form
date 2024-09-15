import type { ViewNodeId } from "../identity/index.js";
import type { InstancePathLike } from "../path/types.js";
import { toInstancePath } from "../path/instance-path.js";
import type { FieldSnapshot, FormSnapshot, JsonValue, ViewSnapshot } from "./contracts.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { runtimeDiagnostic } from "./diagnostics.js";
import { FormRuntimeError } from "./error.js";

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
  evaluateSelector<T>(selector: RuntimeSelector<T>): T;
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
    deps: Object.freeze([`value:${canonical}`, `field:${canonical}`]),
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
  readonly diagnostics: readonly import("../diagnostic/index.js").Diagnostic[];
  readonly version: number;
}

function freezeSelectorResult<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    return Object.freeze(value) as T;
  }
  return value;
}
