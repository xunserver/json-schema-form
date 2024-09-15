import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { FormDefinition } from "../definition/form-definition.js";
import type { CompileResult } from "../model/compile-result.js";
import type { FormEnvironment } from "../extension/environment.js";
import type { FormPlugin } from "../extension/plugin.js";
import type { RegistryOverride } from "../extension/registry.js";
import type { InstancePath, InstancePathLike } from "../path/types.js";
import type { ViewNodeId } from "../identity/index.js";

export type JsonPrimitive = null | boolean | number | string;

export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface CreateFormOptions {
  readonly initialValues?: unknown;
  readonly environment?: FormEnvironment;
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
}

export interface FieldSnapshot {
  readonly path: InstancePath;
  readonly value: JsonValue | undefined;
  readonly dirty: boolean;
  readonly touched: boolean;
}

export interface ViewSnapshot {
  readonly id: ViewNodeId;
  readonly focused: boolean;
}

export interface FieldInstance {
  readonly path: InstancePath;
  getValue(): JsonValue | undefined;
  getState(): FieldSnapshot;
  setValue(value: unknown): void;
  touch(): void;
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
}

export interface FormEngine {
  compile(definition: FormDefinition): CompileResult;
  create(model: CompiledFormModel, options?: { readonly initialValues?: unknown }): FormInstance;
}
