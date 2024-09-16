import type { EffectiveState, FormInstance, JsonValue, ValidationError } from "@form/core";
import { currentBindingSelector, effectiveStateSelector, getRuntimeSnapshot, presentableErrorSelector } from "@form/core/runtime";

export interface ObservationRecord {
  readonly values: JsonValue;
  readonly identities: readonly {
    readonly index: number;
    readonly kept: boolean;
  }[];
  readonly effective: Readonly<Record<string, EffectiveState>>;
  readonly errors: readonly {
    readonly code: string;
    readonly source: ValidationError["source"];
    readonly path: string;
  }[];
  readonly version: number;
  readonly serialized: JsonValue;
  readonly submitted?: JsonValue;
}

export function observeForm(
  form: FormInstance,
  options: { readonly previousIds?: readonly string[]; readonly submitted?: JsonValue } = {},
): ObservationRecord {
  const items = form.array("products").items();
  const previous = new Set(options.previousIds ?? items.map((item) => item.id));
  const effectivePaths = ["name", "nickname", "amount", "products[0].title", "products[1].title"];
  const effective: Record<string, EffectiveState> = {};
  for (const path of effectivePaths) {
    effective[path] = getRuntimeSnapshot(form, effectiveStateSelector(path));
  }
  return {
    values: form.getValues(),
    identities: items.map((item, index) => ({
      index,
      kept: previous.has(item.id),
    })),
    effective,
    errors: form.getState().errors.map((error) => ({
      code: error.code,
      source: error.source,
      path: String(error.instancePath ?? ""),
    })),
    version: form.getState().version,
    serialized: form.serialize(),
    ...(options.submitted === undefined ? {} : { submitted: options.submitted }),
  };
}

export function compareObservations(left: ObservationRecord, right: ObservationRecord): string[] {
  const diffs: string[] = [];
  if (JSON.stringify(left.values) !== JSON.stringify(right.values)) {
    diffs.push("values");
  }
  if (JSON.stringify(left.identities) !== JSON.stringify(right.identities)) {
    diffs.push("identities");
  }
  if (JSON.stringify(left.effective) !== JSON.stringify(right.effective)) {
    diffs.push("effective");
  }
  if (JSON.stringify(left.errors) !== JSON.stringify(right.errors)) {
    diffs.push("errors");
  }
  if (left.version !== right.version) {
    diffs.push("version");
  }
  if (JSON.stringify(left.serialized) !== JSON.stringify(right.serialized)) {
    diffs.push("serialized");
  }
  if (JSON.stringify(left.submitted) !== JSON.stringify(right.submitted)) {
    diffs.push("submitted");
  }
  return diffs;
}

export function inspectBinding(form: FormInstance, path: string) {
  return getRuntimeSnapshot(form, currentBindingSelector(path));
}

export function inspectPresentable(form: FormInstance, path: string) {
  return getRuntimeSnapshot(form, presentableErrorSelector(path));
}
