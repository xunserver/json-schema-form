import type { JsonSchema } from "../definition/json-schema.js";
import type { JsonValue } from "../definition/json-value.js";
import type { InstancePath, ModelPath } from "../model/path/index.js";

export interface ValidatorAbortSignal {
  readonly aborted: boolean;
  readonly reason?: unknown;
}

export interface CustomValidatorIssue {
  readonly code: string;
  readonly message?: string;
  readonly params?: JsonValue;
  readonly instancePath?: string;
}

export interface SchemaAdapterIssue {
  readonly code: string;
  readonly instancePath: string;
  readonly message?: string;
  readonly keyword?: string;
  readonly params?: JsonValue;
  readonly schemaPath?: string;
}

export interface CustomValidatorContext {
  readonly path: InstancePath;
  readonly modelPath: ModelPath;
  readonly target: JsonValue | undefined;
  readonly dependencies: Readonly<Record<string, JsonValue | undefined>>;
  readonly options: JsonValue | undefined;
}

export interface SchemaValidateAllInput {
  readonly schema: JsonSchema;
  readonly value: JsonValue | undefined;
}

export interface SchemaValidateAtInput extends SchemaValidateAllInput {
  readonly instancePath: string;
}

export interface SchemaValidateAffectedInput extends SchemaValidateAllInput {
  readonly instancePaths: readonly string[];
}

export interface SchemaAdapterCapabilities {
  readonly validateAt?: boolean;
  readonly validateAffected?: boolean;
}

export interface SyncValidatorDefinition {
  readonly name: string;
  readonly kind: "sync";
  readonly validate: (context: CustomValidatorContext) => readonly CustomValidatorIssue[] | void;
}

export interface AsyncValidatorDefinition {
  readonly name: string;
  readonly kind: "async";
  readonly validate: (
    context: CustomValidatorContext,
    signal?: ValidatorAbortSignal,
  ) => Promise<readonly CustomValidatorIssue[] | void>;
}

export interface SchemaAdapterDefinition {
  readonly name: string;
  readonly kind: "schema-adapter";
  readonly capabilities?: SchemaAdapterCapabilities;
  readonly validateAll: (input: SchemaValidateAllInput) => readonly SchemaAdapterIssue[];
  readonly validateAt?: (input: SchemaValidateAtInput) => readonly SchemaAdapterIssue[];
  readonly validateAffected?: (input: SchemaValidateAffectedInput) => readonly SchemaAdapterIssue[];
}

export type ValidatorDefinition =
  | SyncValidatorDefinition
  | AsyncValidatorDefinition
  | SchemaAdapterDefinition;

export type ValidatorKind = ValidatorDefinition["kind"];
