export { definePlugin } from "./plugin.js";
export type { FormPlugin, PluginContributions } from "./plugin.js";

export { defineWidget } from "./define-widget.js";
export { defineRuleFunction } from "./define-rule-function.js";
export { defineValidator } from "./define-validator.js";

export { createFormEnvironment } from "./create-form-environment.js";
export { EnvironmentBuildError } from "./environment-build-error.js";
export { CORE_EXTENSION_PROTOCOL } from "./protocol.js";
export type { ProtocolCompatibility, ProtocolVersion } from "./protocol.js";

export { PLUGIN_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
export type { PluginDiagnosticCode } from "./diagnostic-codes.js";

export { BUILTIN_WIDGET_KEYS, FULL_WIDGET_INTERACTION, WIDGET_SEMANTIC_ACTIONS } from "./widget.js";
export type {
  BuiltinWidgetKey,
  JsonValueType,
  WidgetCanonicalValueKind,
  WidgetCapabilities,
  WidgetDefaults,
  WidgetDefinition,
  WidgetInteractionContract,
  WidgetInteractionInspection,
  WidgetInteractionIssueReason,
  WidgetMatcher,
  WidgetPropSchema,
  WidgetPropsContract,
  WidgetSemanticAction,
  WidgetValueContract,
} from "./widget.js";

export type {
  AsyncValidatorDefinition,
  CustomValidatorContext,
  CustomValidatorIssue,
  InstrumentationDefinition,
  InstrumentationObservation,
  RuleFunctionDefinition,
  SchemaAdapterCapabilities,
  SchemaAdapterDefinition,
  SchemaAdapterIssue,
  SchemaDialectDefinition,
  SchemaExtensionDefinition,
  SchemaValidateAffectedInput,
  SchemaValidateAllInput,
  SchemaValidateAtInput,
  SerializerContext,
  SerializerDefinition,
  SyncValidatorDefinition,
  ValidatorAbortSignal,
  ValidatorDefinition,
  ValidatorKind,
  ValueInitializerDefinition,
} from "./contributions.js";

export { REGISTRY_KINDS } from "./registry.js";
export type {
  Registry,
  RegistryEntryInspection,
  RegistryKind,
  RegistryOverride,
} from "./registry.js";

export type { CreateFormEnvironmentOptions, FormEnvironment } from "./environment.js";
