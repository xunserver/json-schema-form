import type { JsonValue } from "../definition/json-value.js";

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

export interface ValidatorDefinition {
  readonly name: string;
  readonly target?: string;
  readonly dependencies?: readonly string[];
}

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
