import type { FormConfig } from "../definition/form-config.js";
import type { JsonValue } from "../definition/json-value.js";
import type { RuleDefinition } from "../definition/rule-definition.js";
import type { FieldUI } from "../definition/ui-schema.js";
import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { ModelPath, SchemaPath } from "../model/path/index.js";
import type { ValidatorDefinition as ProtocolValidatorDefinition } from "../validation/protocol.js";

export interface DialectDiagnostic {
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly code?: string;
  readonly schemaPath?: SchemaPath;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface DialectConvertResult {
  readonly schema: JsonValue;
  readonly diagnostics?: readonly DialectDiagnostic[];
}

export interface SchemaDialectDefinition {
  readonly name: string;
  readonly dialects: readonly string[];
  readonly convert: (schema: JsonValue) => DialectConvertResult;
}

export interface SchemaExtensionSplitInput {
  readonly value: JsonValue;
  readonly schemaPath: SchemaPath;
  readonly modelPath: ModelPath;
}

export interface SchemaExtensionSplitResult {
  readonly fieldUI?: FieldUI;
  readonly rules?: readonly RuleDefinition[];
  readonly config?: Partial<FormConfig>;
}

export interface SchemaExtensionDefinition {
  readonly name: string;
  readonly keyword: `x-${string}`;
  readonly split: (input: SchemaExtensionSplitInput) => SchemaExtensionSplitResult;
}

export interface RuleFunctionDefinition {
  readonly name: string;
  readonly evaluate: (args: readonly JsonValue[]) => JsonValue;
}

export type {
  AsyncValidatorDefinition,
  SchemaAdapterCapabilities,
  SchemaAdapterDefinition,
  SchemaAdapterIssue,
  SchemaValidateAffectedInput,
  SchemaValidateAllInput,
  SchemaValidateAtInput,
  SyncValidatorDefinition,
  CustomValidatorContext,
  CustomValidatorIssue,
  ValidatorAbortSignal,
  ValidatorKind,
} from "../validation/protocol.js";

export type ValidatorDefinition = ProtocolValidatorDefinition;

export interface SerializerContext {
  readonly version: number;
  readonly includeInactive: boolean;
}

export interface SerializerDefinition {
  readonly name: string;
  readonly serialize: (value: JsonValue, context: SerializerContext) => JsonValue;
}

export interface ValueInitializerInput {
  readonly initialValues: JsonValue | undefined;
  readonly model: CompiledFormModel;
}

export interface ValueInitializerDefinition {
  readonly name: string;
  readonly initialize: (input: ValueInitializerInput) => JsonValue;
}

export interface InstrumentationObservation {
  readonly type: string;
}

export interface InstrumentationDefinition {
  readonly name: string;
  readonly observe?: (event: InstrumentationObservation) => void;
}
