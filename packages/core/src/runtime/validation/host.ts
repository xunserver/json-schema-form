import type { Diagnostic } from "../../diagnostic/index.js";
import type { JsonValue } from "../../definition/json-value.js";
import type { FormEnvironment } from "../../extension/environment.js";
import type { CompiledFormModel } from "../../model/compiled-form-model.js";
import type { InstancePath } from "../../model/path/index.js";
import type { BindingIndex } from "../dependency/binding-index.js";
import type { SerializeOptions } from "../form/contracts.js";
import type { TransactionDraft } from "../transaction/commands.js";

export interface ValidationHost {
  readonly model: CompiledFormModel;
  readonly environment: FormEnvironment;
  bindings(draft?: TransactionDraft): BindingIndex;
  values(draft?: TransactionDraft): JsonValue;
  version(): number;
  mutationEpoch(): number;
  isActive(path: InstancePath): boolean;
  activationChanged(path: InstancePath): boolean;
  isTouched(path: InstancePath): boolean;
  serialize(options?: SerializeOptions): JsonValue;
  emit(diagnostics: readonly Diagnostic[]): void;
  fail(diagnostics: readonly Diagnostic[]): never;
  publishState(affected: ReadonlySet<string>, bumpVersion: boolean): void;
}
