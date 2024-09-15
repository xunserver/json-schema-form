import type { Diagnostic } from "../diagnostic/index.js";
import type { ProtocolVersion } from "./protocol.js";
import type { FormPlugin } from "./plugin.js";
import type {
  Registry,
  RegistryEntryInspection,
  RegistryKind,
  RegistryOverride,
} from "./registry.js";
import type {
  InstrumentationDefinition,
  RuleFunctionDefinition,
  SchemaDialectDefinition,
  SchemaExtensionDefinition,
  SerializerDefinition,
  ValidatorDefinition,
  ValueInitializerDefinition,
} from "./contributions.js";
import type { WidgetDefinition } from "./widget.js";

export interface FormEnvironment {
  readonly protocol: ProtocolVersion;
  readonly pluginIds: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly widgets: Registry<WidgetDefinition>;
  readonly schemaDialects: Registry<SchemaDialectDefinition>;
  readonly schemaExtensions: Registry<SchemaExtensionDefinition>;
  readonly ruleFunctions: Registry<RuleFunctionDefinition>;
  readonly validators: Registry<ValidatorDefinition>;
  readonly serializers: Registry<SerializerDefinition>;
  readonly valueInitializers: Registry<ValueInitializerDefinition>;
  readonly instrumentation: Registry<InstrumentationDefinition>;
  inspect(kind: RegistryKind, key: string): RegistryEntryInspection<unknown> | undefined;
}

export interface CreateFormEnvironmentOptions {
  readonly plugins?: readonly FormPlugin[];
  readonly overrides?: readonly RegistryOverride[];
}
