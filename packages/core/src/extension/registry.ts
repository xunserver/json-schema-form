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

export const REGISTRY_KINDS = [
  "widgets",
  "schemaDialects",
  "schemaExtensions",
  "ruleFunctions",
  "validators",
  "serializers",
  "valueInitializers",
  "instrumentation",
] as const;

export type RegistryKind = (typeof REGISTRY_KINDS)[number];

export const REGISTRY_KIND_RANK: Readonly<Record<RegistryKind, number>> = Object.freeze({
  widgets: 0,
  schemaDialects: 1,
  schemaExtensions: 2,
  ruleFunctions: 3,
  validators: 4,
  serializers: 5,
  valueInitializers: 6,
  instrumentation: 7,
});

export interface RegistryOverride {
  readonly registry: RegistryKind;
  readonly key: string;
  readonly byPlugin: string;
}

export interface RegistryEntryInspection<T> {
  readonly key: string;
  readonly pluginId: string;
  readonly value: T;
}

export interface Registry<T> {
  readonly size: number;
  has(key: string): boolean;
  get(key: string): T | undefined;
  keys(): IterableIterator<string>;
  values(): IterableIterator<T>;
  entries(): IterableIterator<readonly [string, T]>;
  inspect(key: string): RegistryEntryInspection<T> | undefined;
  inspectAll(): readonly RegistryEntryInspection<T>[];
  [Symbol.iterator](): IterableIterator<readonly [string, T]>;
}

export type ContributionByKind = {
  readonly widgets: WidgetDefinition;
  readonly schemaDialects: SchemaDialectDefinition;
  readonly schemaExtensions: SchemaExtensionDefinition;
  readonly ruleFunctions: RuleFunctionDefinition;
  readonly validators: ValidatorDefinition;
  readonly serializers: SerializerDefinition;
  readonly valueInitializers: ValueInitializerDefinition;
  readonly instrumentation: InstrumentationDefinition;
};

export function createRegistry<T>(
  entries: readonly RegistryEntryInspection<T>[],
): Registry<T> {
  const list: readonly RegistryEntryInspection<T>[] = Object.freeze(
    entries.map((entry) =>
      Object.freeze({
        key: entry.key,
        pluginId: entry.pluginId,
        value: entry.value,
      }),
    ),
  );
  const byKey = new Map(list.map((entry) => [entry.key, entry]));

  const registry: Registry<T> = {
    get size() {
      return list.length;
    },
    has(key: string) {
      return byKey.has(key);
    },
    get(key: string) {
      return byKey.get(key)?.value;
    },
    *keys() {
      for (const entry of list) {
        yield entry.key;
      }
    },
    *values() {
      for (const entry of list) {
        yield entry.value;
      }
    },
    *entries() {
      for (const entry of list) {
        yield [entry.key, entry.value];
      }
    },
    inspect(key: string) {
      return byKey.get(key);
    },
    inspectAll() {
      return list;
    },
    *[Symbol.iterator]() {
      for (const entry of list) {
        yield [entry.key, entry.value];
      }
    },
  };

  return Object.freeze(registry);
}
