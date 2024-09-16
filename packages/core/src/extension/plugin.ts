import type { ProtocolCompatibility } from "./protocol.js";
import type {
  InstrumentationDefinition,
  RuleFunctionDefinition,
  SchemaDialectDefinition,
  SchemaExtensionDefinition,
  SerializerDefinition,
  ValidatorDefinition,
  ValueInitializerDefinition,
} from "./contributions.js";
import type { WidgetDefinition } from "../widget/widget.js";

export interface PluginContributions {
  readonly widgets?: Readonly<Record<string, WidgetDefinition>>;
  readonly schemaDialects?: Readonly<Record<string, SchemaDialectDefinition>>;
  readonly schemaExtensions?: Readonly<Record<string, SchemaExtensionDefinition>>;
  readonly ruleFunctions?: Readonly<Record<string, RuleFunctionDefinition>>;
  readonly validators?: Readonly<Record<string, ValidatorDefinition>>;
  readonly serializers?: Readonly<Record<string, SerializerDefinition>>;
  readonly valueInitializers?: Readonly<Record<string, ValueInitializerDefinition>>;
  readonly instrumentation?: Readonly<Record<string, InstrumentationDefinition>>;
}

export interface FormPlugin {
  readonly id: string;
  readonly protocol?: ProtocolCompatibility;
  readonly dependsOn?: readonly string[];
  readonly contributes?: PluginContributions;
}

type ExactKeys<T, Allowed> = {
  [K in Exclude<keyof T, keyof Allowed>]: never;
};

/** 声明 Plugin 贡献；不安装全局 Registry。 */
export function definePlugin<const T extends FormPlugin>(
  plugin: T & ExactKeys<T, FormPlugin>,
): T {
  return plugin;
}
