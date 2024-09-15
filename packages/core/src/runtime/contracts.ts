import type { JsonValue } from "../definition/json-value.js";
import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { FormDefinition } from "../definition/form-definition.js";
import type { CompileResult } from "../model/compile-result.js";
import type { FormEnvironment } from "../extension/environment.js";
import type { FormPlugin } from "../extension/plugin.js";
import type { RegistryOverride } from "../extension/registry.js";
import type { ArrayItemId, ViewNodeId } from "../identity/index.js";
import type { InstancePath, InstancePathLike, ModelPathLike } from "../path/types.js";

export type { JsonPrimitive, JsonValue } from "../definition/json-value.js";

export interface EffectiveState {
  readonly active: boolean;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly readonly: boolean;
}

export interface SerializeOptions {
  readonly includeInactive?: boolean;
  readonly serializer?: string;
}

export interface ArrayIdentityResolverConfig {
  readonly path: ModelPathLike;
  readonly resolve: (item: JsonValue) => string | number | undefined;
}

export interface CreateFormOptions {
  readonly initialValues?: unknown;
  readonly environment?: FormEnvironment;
  readonly arrayIdentityResolvers?: readonly ArrayIdentityResolverConfig[];
}

export interface CreateFormEngineOptions {
  readonly plugins?: readonly FormPlugin[];
  readonly overrides?: readonly RegistryOverride[];
}

export interface FormSnapshot {
  readonly values: JsonValue;
  readonly dirty: boolean;
  readonly touched: boolean;
  readonly version: number;
  readonly active: boolean;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly readonly: boolean;
}

export interface FieldSnapshot {
  readonly path: InstancePath;
  readonly value: JsonValue | undefined;
  readonly dirty: boolean;
  readonly touched: boolean;
  readonly active: boolean;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly readonly: boolean;
}

export interface ViewSnapshot {
  readonly id: ViewNodeId;
  readonly focused: boolean;
  readonly active: boolean;
  readonly visible: boolean;
  readonly disabled: boolean;
  readonly readonly: boolean;
}

export interface ArrayItemSnapshot {
  readonly id: ArrayItemId;
  readonly index: number;
  readonly path: InstancePath;
  readonly value: JsonValue | undefined;
}

export type ArrayItemRef = number | ArrayItemId;

export interface FieldInstance {
  readonly path: InstancePath;
  getValue(): JsonValue | undefined;
  getState(): FieldSnapshot;
  setValue(value: unknown): void;
  touch(): void;
}

export interface ArrayInstance {
  readonly path: InstancePath;
  items(): readonly ArrayItemSnapshot[];
  item(ref: ArrayItemRef): ScopedFormInstance;
  append(value: unknown): ArrayItemId;
  insert(index: number, value: unknown): ArrayItemId;
  remove(item: ArrayItemRef): void;
  move(from: ArrayItemRef, to: number): void;
  setItemValue(item: ArrayItemRef, value: unknown): void;
  replaceItem(item: ArrayItemRef, value: unknown): ArrayItemId;
  clear(): void;
}

export interface ScopedFormInstance {
  readonly path: InstancePath;
  getValue(path?: InstancePathLike): JsonValue | undefined;
  getField(path: InstancePathLike): FieldInstance;
  setValue(path: InstancePathLike, value: unknown): void;
  touch(path: InstancePathLike): void;
  focus(viewId: ViewNodeId): void;
  array(path: InstancePathLike): ArrayInstance;
  scope(path: InstancePathLike): ScopedFormInstance;
}

export interface FormInstance {
  readonly model: CompiledFormModel;
  getValue(path: InstancePathLike): JsonValue | undefined;
  getValues(): JsonValue;
  getState(): FormSnapshot;
  getField(path: InstancePathLike): FieldInstance;
  setValue(path: InstancePathLike, value: unknown): void;
  setValues(values: unknown): void;
  touch(path: InstancePathLike): void;
  focus(viewId: ViewNodeId): void;
  reset(): void;
  array(path: InstancePathLike): ArrayInstance;
  scope(path: InstancePathLike): ScopedFormInstance;
  serialize(options?: SerializeOptions): JsonValue;
}

export interface FormEngine {
  compile(definition: FormDefinition): CompileResult;
  create(model: CompiledFormModel, options?: { readonly initialValues?: unknown }): FormInstance;
}

export interface CurrentBindingSnapshot {
  readonly path: InstancePath;
  readonly itemId: ArrayItemId | undefined;
}
