import type { JsonValue } from "../definition/json-value.js";
import type { ValidatorDefinition as ProtocolValidatorDefinition } from "../validation/protocol.js";

export interface SchemaDialectDefinition {
  readonly id: string;
  readonly $schema?: string;
}

export interface SchemaExtensionDefinition {
  readonly keyword: string;
  readonly vocabulary?: string;
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

export interface ValueInitializerDefinition {
  readonly name: string;
}

export interface InstrumentationObservation {
  readonly type: string;
}

export interface InstrumentationDefinition {
  readonly name: string;
  readonly observe?: (event: InstrumentationObservation) => void;
}
