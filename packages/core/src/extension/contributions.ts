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
}

export interface ValidatorDefinition {
  readonly name: string;
  readonly target?: string;
  readonly dependencies?: readonly string[];
}

export interface SerializerDefinition {
  readonly name: string;
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
