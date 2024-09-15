import type { JsonValue } from "../definition/json-value.js";
import type { InstancePath, ModelPath, SchemaPath } from "../path/index.js";

export type ValidationErrorSource = "schema" | "custom" | "async" | "server";

export interface ValidationError {
  readonly id: string;
  readonly code: string;
  readonly source: ValidationErrorSource;
  readonly instancePath: InstancePath;
  readonly modelPath?: ModelPath;
  readonly message?: string;
  readonly keyword?: string;
  readonly params?: JsonValue;
  readonly validatorId?: string;
  readonly schemaPath?: SchemaPath;
}

export interface ServerErrorInput {
  readonly code: string;
  readonly instancePath: string;
  readonly message?: string;
  readonly keyword?: string;
  readonly params?: JsonValue;
  readonly source?: "server";
}

export interface ApplyErrorsOptions {
  readonly preserveOnChange?: boolean;
}

export interface ValidationResult {
  readonly version: number;
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly superseded: boolean;
}

export interface SubmitResult {
  readonly version: number;
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly superseded: boolean;
  readonly submitted: boolean;
  readonly payload?: JsonValue;
}

export type SubmitHandler = (payload: JsonValue) => unknown | Promise<unknown>;
