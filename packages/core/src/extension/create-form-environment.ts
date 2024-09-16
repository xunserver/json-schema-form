import type { Diagnostic } from "../diagnostic/index.js";
import { rememberEnvironmentIdentity } from "../engine/environment-identity.js";
import { coreBuiltInPlugin } from "../widget/built-in.js";
import { cloneAndFreezeOwned, isPlainObject } from "./clone-freeze.js";
import { resolvePluginGraph } from "./dependency-graph.js";
import {
  PLUGIN_DIAGNOSTIC_CODE_RANK,
  PLUGIN_DIAGNOSTIC_CODES,
  type PluginDiagnosticCode,
} from "./diagnostic-codes.js";
import type { CreateFormEnvironmentOptions, FormEnvironment } from "./environment.js";
import { EnvironmentBuildError, freezeDiagnostic } from "./environment-build-error.js";
import type { FormPlugin, PluginContributions } from "./plugin.js";
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
import { inspectWidgetInteraction, widgetDescriptorHasRuntimeHandler } from "../widget/widget.js";
import {
  CORE_EXTENSION_PROTOCOL,
  isProtocolCompatible,
  isWellFormedProtocolVersion,
  type ProtocolCompatibility,
  type ProtocolVersion,
} from "./protocol.js";
import {
  createRegistry,
  REGISTRY_KIND_RANK,
  REGISTRY_KINDS,
  type Registry,
  type RegistryEntryInspection,
  type RegistryKind,
  type RegistryOverride,
} from "./registry.js";

interface PluginSnapshot {
  readonly ordinal: number;
  readonly validShape: boolean;
  readonly id: string;
  readonly protocol: unknown;
  readonly dependsOn: readonly string[];
  readonly contributes: unknown;
}

interface TrackedDiagnostic {
  readonly diagnostic: Diagnostic;
  readonly ordinal: number;
  readonly codeRank: number;
  readonly registryIndex: number;
  readonly key: string;
}

type RegistryStores = {
  [K in RegistryKind]: Map<string, RegistryEntryInspection<unknown>>;
};

/** 校验并冻结 Core Plugin Registry。失败抛 `EnvironmentBuildError`，不发布 partial Registry。 */
export function createFormEnvironment(options?: CreateFormEnvironmentOptions): FormEnvironment {
  const userPlugins = options?.plugins === undefined ? [] : [...options.plugins];
  const overrides = options?.overrides === undefined ? [] : [...options.overrides];
  const snapshots: PluginSnapshot[] = [
    snapshotPlugin(coreBuiltInPlugin, 0),
    ...userPlugins.map((plugin, index) => snapshotPlugin(plugin, index + 1)),
  ];
  const tracked: TrackedDiagnostic[] = [];

  for (const snapshot of snapshots) {
    if (!snapshot.validShape) {
      tracked.push(
        trackDiagnostic({
          code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
          severity: "error",
          message: "Plugin must be a plain object",
          ordinal: snapshot.ordinal,
          metadata: { reason: "non-plain-plugin" },
        }),
      );
      continue;
    }

    if (!isValidPluginId(snapshot.id)) {
      tracked.push(
        trackDiagnostic({
          code: PLUGIN_DIAGNOSTIC_CODES.INVALID_ID,
          severity: "error",
          message: "Plugin id must be a non-empty string without leading or trailing whitespace",
          ordinal: snapshot.ordinal,
          metadata: { id: snapshot.id },
        }),
      );
    }
  }

  const firstById = new Map<string, PluginSnapshot>();
  for (const snapshot of snapshots) {
    if (!snapshot.validShape || !isValidPluginId(snapshot.id)) {
      continue;
    }

    const existing = firstById.get(snapshot.id);
    if (existing !== undefined) {
      tracked.push(
        trackDiagnostic({
          code: PLUGIN_DIAGNOSTIC_CODES.DUPLICATE_ID,
          severity: "error",
          message: `Duplicate plugin id "${snapshot.id}"`,
          pluginId: snapshot.id,
          ordinal: snapshot.ordinal,
          metadata: { pluginId: snapshot.id, firstOrdinal: existing.ordinal },
        }),
      );
      continue;
    }

    firstById.set(snapshot.id, snapshot);
  }

  const unique = [...firstById.values()];

  for (const snapshot of unique) {
    const compatibility = readCompatibility(snapshot.protocol);
    if (compatibility === undefined) {
      continue;
    }

    if (compatibility === "malformed" || !isProtocolCompatible(compatibility)) {
      const requested =
        compatibility === "malformed"
          ? snapshot.protocol
          : freezeProtocolRange(compatibility);
      tracked.push(
        trackDiagnostic({
          code: PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_INCOMPATIBLE,
          severity: "error",
          message: `Plugin "${snapshot.id}" is incompatible with extension protocol ${formatProtocol(CORE_EXTENSION_PROTOCOL)}`,
          pluginId: snapshot.id,
          ordinal: snapshot.ordinal,
          metadata: {
            pluginId: snapshot.id,
            requested,
            current: freezeProtocolVersion(CORE_EXTENSION_PROTOCOL),
          },
        }),
      );
    }
  }

  const graph = resolvePluginGraph(
    unique.map((snapshot) => ({
      id: snapshot.id,
      ordinal: snapshot.ordinal,
      dependsOn: snapshot.dependsOn,
    })),
  );

  for (const missing of graph.missing) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.MISSING_DEPENDENCY,
        severity: "error",
        message: `Plugin "${missing.pluginId}" depends on missing plugin "${missing.dependency}"`,
        pluginId: missing.pluginId,
        ordinal: missing.ordinal,
        metadata: { pluginId: missing.pluginId, dependency: missing.dependency },
      }),
    );
  }

  for (const cycle of graph.cycles) {
    const start = cycle.path[0];
    if (start === undefined) {
      continue;
    }
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.DEPENDENCY_CYCLE,
        severity: "error",
        message: `Plugin dependency cycle: ${cycle.path.join(" -> ")}`,
        pluginId: start,
        ordinal: cycle.ordinal,
        metadata: { cycle: Object.freeze([...cycle.path]) },
      }),
    );
  }

  const byId = new Map(unique.map((snapshot) => [snapshot.id, snapshot]));
  const installOrder = graph.cycles.length === 0 ? graph.order : unique.map((snapshot) => snapshot.id);
  const stores = createStores();

  for (const pluginId of installOrder) {
    const snapshot = byId.get(pluginId);
    if (snapshot === undefined) {
      continue;
    }
    collectContributions(snapshot, stores, overrides, tracked);
  }

  validateUniqueDialectUris(stores, unique, tracked);
  validateUniqueExtensionKeywords(stores, unique, tracked);

  const errors = tracked.filter((item) => item.diagnostic.severity === "error");
  if (errors.length > 0) {
    throw new EnvironmentBuildError(sortDiagnostics(errors));
  }

  const pluginIds = Object.freeze(
    (graph.order.length === unique.length ? graph.order : unique.map((snapshot) => snapshot.id)).slice(),
  );
  const widgets = createTypedRegistry<WidgetDefinition>(stores.widgets);
  const schemaDialects = createTypedRegistry<SchemaDialectDefinition>(stores.schemaDialects);
  const schemaExtensions = createTypedRegistry<SchemaExtensionDefinition>(stores.schemaExtensions);
  const ruleFunctions = createTypedRegistry<RuleFunctionDefinition>(stores.ruleFunctions);
  const validators = createTypedRegistry<ValidatorDefinition>(stores.validators);
  const serializers = createTypedRegistry<SerializerDefinition>(stores.serializers);
  const valueInitializers = createTypedRegistry<ValueInitializerDefinition>(stores.valueInitializers);
  const instrumentation = createTypedRegistry<InstrumentationDefinition>(stores.instrumentation);
  const registries = {
    widgets,
    schemaDialects,
    schemaExtensions,
    ruleFunctions,
    validators,
    serializers,
    valueInitializers,
    instrumentation,
  } as const;

  const environment: FormEnvironment = {
    protocol: CORE_EXTENSION_PROTOCOL,
    pluginIds,
    diagnostics: Object.freeze(sortDiagnostics(tracked).map(freezeDiagnostic)),
    widgets,
    schemaDialects,
    schemaExtensions,
    ruleFunctions,
    validators,
    serializers,
    valueInitializers,
    instrumentation,
    inspect(kind, key) {
      return registries[kind].inspect(key);
    },
  };

  const frozen = Object.freeze(environment);
  rememberEnvironmentIdentity(frozen);
  return frozen;
}

function snapshotPlugin(plugin: FormPlugin, ordinal: number): PluginSnapshot {
  if (!isPlainObject(plugin)) {
    return {
      ordinal,
      validShape: false,
      id: "",
      protocol: undefined,
      dependsOn: Object.freeze([]),
      contributes: undefined,
    };
  }

  return {
    ordinal,
    validShape: true,
    id: typeof plugin.id === "string" ? plugin.id : "",
    protocol: plugin.protocol,
    dependsOn: readDependsOn(plugin.dependsOn),
    contributes: plugin.contributes,
  };
}

function readDependsOn(value: unknown): readonly string[] {
  if (value === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }

  return Object.freeze(value.filter((item): item is string => typeof item === "string"));
}

function isValidPluginId(id: string): boolean {
  return id.length > 0 && id.trim() === id;
}

function readCompatibility(protocol: unknown): ProtocolCompatibility | "malformed" | undefined {
  if (protocol === undefined) {
    return undefined;
  }

  if (!isPlainObject(protocol) || !isWellFormedProtocolVersion(protocol.min)) {
    return "malformed";
  }

  const maxExclusive = protocol.maxExclusive;
  if (maxExclusive !== undefined && !isWellFormedProtocolVersion(maxExclusive)) {
    return "malformed";
  }

  const compatibility: ProtocolCompatibility = {
    min: protocol.min as ProtocolVersion,
    ...(maxExclusive === undefined ? {} : { maxExclusive: maxExclusive as ProtocolVersion }),
  };
  return compatibility;
}

function freezeProtocolVersion(version: ProtocolVersion): ProtocolVersion {
  return Object.freeze({ major: version.major, minor: version.minor });
}

function freezeProtocolRange(compatibility: ProtocolCompatibility): object {
  return Object.freeze({
    min: freezeProtocolVersion(compatibility.min),
    ...(compatibility.maxExclusive === undefined
      ? {}
      : { maxExclusive: freezeProtocolVersion(compatibility.maxExclusive) }),
  });
}

function formatProtocol(version: ProtocolVersion): string {
  return `${version.major}.${version.minor}`;
}

function createStores(): RegistryStores {
  return {
    widgets: new Map(),
    schemaDialects: new Map(),
    schemaExtensions: new Map(),
    ruleFunctions: new Map(),
    validators: new Map(),
    serializers: new Map(),
    valueInitializers: new Map(),
    instrumentation: new Map(),
  };
}

function collectContributions(
  snapshot: PluginSnapshot,
  stores: RegistryStores,
  overrides: readonly RegistryOverride[],
  tracked: TrackedDiagnostic[],
): void {
  if (snapshot.contributes === undefined) {
    return;
  }

  if (!isPlainObject(snapshot.contributes)) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" contributions must be a plain object`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        metadata: { reason: "non-plain-contributions" },
      }),
    );
    return;
  }

  const contributes = snapshot.contributes as PluginContributions;
  for (const kind of REGISTRY_KINDS) {
    const record = contributes[kind];
    if (record === undefined) {
      continue;
    }

    if (!isPlainObject(record)) {
      tracked.push(
        trackDiagnostic({
          code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
          severity: "error",
          message: `Plugin "${snapshot.id}" ${kind} contributions must be a plain object`,
          pluginId: snapshot.id,
          ordinal: snapshot.ordinal,
          registry: kind,
          metadata: { registry: kind, reason: "non-plain-record" },
        }),
      );
      continue;
    }

    for (const key of Object.keys(record).sort()) {
      registerContribution(snapshot, kind, key, record[key], stores, overrides, tracked);
    }
  }
}

function registerContribution(
  snapshot: PluginSnapshot,
  kind: RegistryKind,
  key: string,
  incoming: unknown,
  stores: RegistryStores,
  overrides: readonly RegistryOverride[],
  tracked: TrackedDiagnostic[],
): void {
  const cloned = cloneAndFreezeOwned(incoming);
  if (!cloned.ok) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" contributed an unsupported ${kind} descriptor for "${key}"`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: kind,
        key,
        metadata: { registry: kind, key, reason: cloned.reason },
      }),
    );
    return;
  }

  if (!validateNamedProvider(snapshot, kind, key, cloned.value, tracked)) {
    return;
  }

  if (kind === "widgets" && !validateWidgetContribution(snapshot, key, cloned.value, tracked)) {
    return;
  }

  const store = stores[kind];
  const existing = store.get(key);
  if (existing === undefined) {
    store.set(key, Object.freeze({ key, pluginId: snapshot.id, value: cloned.value }));
    return;
  }

  const allowed = overrides.some(
    (override) =>
      override.registry === kind && override.key === key && override.byPlugin === snapshot.id,
  );
  if (!allowed) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.REGISTRY_CONFLICT,
        severity: "error",
        message: `Registry conflict for ${kind} key "${key}" between "${existing.pluginId}" and "${snapshot.id}"`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: kind,
        key,
        metadata: {
          registry: kind,
          key,
          existingPluginId: existing.pluginId,
          incomingPluginId: snapshot.id,
        },
      }),
    );
    return;
  }

  store.set(key, Object.freeze({ key, pluginId: snapshot.id, value: cloned.value }));
  tracked.push(
    trackDiagnostic({
      code: PLUGIN_DIAGNOSTIC_CODES.REGISTRY_OVERRIDE,
      severity: "warning",
      message: `Plugin "${snapshot.id}" overrode ${kind} key "${key}" previously registered by "${existing.pluginId}"`,
      pluginId: snapshot.id,
      ordinal: snapshot.ordinal,
      registry: kind,
      key,
      metadata: {
        registry: kind,
        key,
        existingPluginId: existing.pluginId,
        incomingPluginId: snapshot.id,
      },
    }),
  );
}

function validateNamedProvider(
  snapshot: PluginSnapshot,
  kind: RegistryKind,
  key: string,
  value: unknown,
  tracked: TrackedDiagnostic[],
): boolean {
  if (
    kind !== "ruleFunctions" &&
    kind !== "serializers" &&
    kind !== "validators" &&
    kind !== "schemaDialects" &&
    kind !== "schemaExtensions" &&
    kind !== "valueInitializers"
  ) {
    return true;
  }
  if (!isPlainObject(value)) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" contributed an invalid ${kind} descriptor for "${key}"`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: kind,
        key,
        metadata: { registry: kind, key, reason: "non-plain-descriptor" },
      }),
    );
    return false;
  }
  const name = value.name;
  if (typeof name !== "string" || name.length === 0) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" ${kind} descriptor "${key}" is missing a name`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: kind,
        key,
        metadata: { registry: kind, key, name, reason: "missing-name" },
      }),
    );
    return false;
  }
  if (name !== key) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" ${kind} key "${key}" does not match descriptor name "${name}"`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: kind,
        key,
        metadata: { registry: kind, key, name, pluginId: snapshot.id },
      }),
    );
    return false;
  }
  if (kind === "ruleFunctions" && typeof value.evaluate !== "function") {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" ruleFunctions descriptor "${key}" must provide a synchronous evaluate() provider`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: kind,
        key,
        metadata: { registry: kind, key, name, reason: "invalid-evaluate" },
      }),
    );
    return false;
  }
  if (kind === "serializers" && typeof value.serialize !== "function") {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" serializers descriptor "${key}" must provide a synchronous serialize() provider`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: kind,
        key,
        metadata: { registry: kind, key, name, reason: "invalid-serialize" },
      }),
    );
    return false;
  }
  if (kind === "validators" && !validateValidatorDescriptor(snapshot, key, name, value, tracked)) {
    return false;
  }
  if (kind === "schemaDialects" && !validateDialectDescriptor(snapshot, key, name, value, tracked)) {
    return false;
  }
  if (kind === "schemaExtensions" && !validateExtensionDescriptor(snapshot, key, name, value, tracked)) {
    return false;
  }
  if (kind === "valueInitializers" && typeof value.initialize !== "function") {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" valueInitializers descriptor "${key}" must provide a synchronous initialize() provider`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: kind,
        key,
        metadata: { registry: kind, key, name, reason: "invalid-initialize" },
      }),
    );
    return false;
  }
  return true;
}

function validateDialectDescriptor(
  snapshot: PluginSnapshot,
  key: string,
  name: string,
  value: Record<string, unknown>,
  tracked: TrackedDiagnostic[],
): boolean {
  const dialects = value.dialects;
  if (
    !Array.isArray(dialects) ||
    dialects.length === 0 ||
    dialects.some((uri) => typeof uri !== "string" || uri.length === 0)
  ) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" schemaDialects descriptor "${key}" must declare a non-empty $schema URI collection`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: "schemaDialects",
        key,
        metadata: { registry: "schemaDialects", key, name, reason: "empty-dialects" },
      }),
    );
    return false;
  }
  if (typeof value.convert !== "function") {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" schemaDialects descriptor "${key}" must provide a synchronous convert() provider`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: "schemaDialects",
        key,
        metadata: { registry: "schemaDialects", key, name, reason: "invalid-convert" },
      }),
    );
    return false;
  }
  return true;
}

function validateExtensionDescriptor(
  snapshot: PluginSnapshot,
  key: string,
  name: string,
  value: Record<string, unknown>,
  tracked: TrackedDiagnostic[],
): boolean {
  const keyword = value.keyword;
  if (typeof keyword !== "string" || !keyword.startsWith("x-") || keyword.length <= 2) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" schemaExtensions descriptor "${key}" keyword must start with "x-"`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: "schemaExtensions",
        key,
        metadata: {
          registry: "schemaExtensions",
          key,
          name,
          keyword,
          pluginId: snapshot.id,
          reason: "invalid-keyword-prefix",
        },
      }),
    );
    return false;
  }
  if (typeof value.split !== "function") {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" schemaExtensions descriptor "${key}" must provide a synchronous split() provider`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: "schemaExtensions",
        key,
        metadata: { registry: "schemaExtensions", key, name, reason: "invalid-split" },
      }),
    );
    return false;
  }
  return true;
}

function pluginOrdinal(snapshots: readonly PluginSnapshot[], pluginId: string): number {
  return snapshots.find((snapshot) => snapshot.id === pluginId)?.ordinal ?? 0;
}

function validateUniqueDialectUris(
  stores: RegistryStores,
  snapshots: readonly PluginSnapshot[],
  tracked: TrackedDiagnostic[],
): void {
  const owners = new Map<string, RegistryEntryInspection<unknown>>();
  const entries = [...stores.schemaDialects.values()].sort((left, right) => {
    if (left.pluginId !== right.pluginId) {
      return left.pluginId < right.pluginId ? -1 : 1;
    }
    return left.key < right.key ? -1 : 1;
  });
  for (const entry of entries) {
    const dialects = (entry.value as SchemaDialectDefinition).dialects;
    if (!Array.isArray(dialects)) {
      continue;
    }
    for (const uri of dialects) {
      const existing = owners.get(uri);
      if (existing === undefined) {
        owners.set(uri, entry);
        continue;
      }
      if (existing.pluginId === entry.pluginId && existing.key === entry.key) {
        continue;
      }
      tracked.push(
        trackDiagnostic({
          code: PLUGIN_DIAGNOSTIC_CODES.REGISTRY_CONFLICT,
          severity: "error",
          message: `Schema dialect URI "${uri}" is registered by both "${existing.pluginId}" and "${entry.pluginId}"`,
          pluginId: entry.pluginId,
          ordinal: pluginOrdinal(snapshots, entry.pluginId),
          registry: "schemaDialects",
          key: entry.key,
          metadata: {
            registry: "schemaDialects",
            uri,
            existingPluginId: existing.pluginId,
            incomingPluginId: entry.pluginId,
            existingKey: existing.key,
            incomingKey: entry.key,
          },
        }),
      );
    }
  }
}

function validateUniqueExtensionKeywords(
  stores: RegistryStores,
  snapshots: readonly PluginSnapshot[],
  tracked: TrackedDiagnostic[],
): void {
  const owners = new Map<string, RegistryEntryInspection<unknown>>();
  const entries = [...stores.schemaExtensions.values()].sort((left, right) => {
    if (left.pluginId !== right.pluginId) {
      return left.pluginId < right.pluginId ? -1 : 1;
    }
    return left.key < right.key ? -1 : 1;
  });
  for (const entry of entries) {
    const keyword = (entry.value as SchemaExtensionDefinition).keyword;
    if (typeof keyword !== "string") {
      continue;
    }
    const existing = owners.get(keyword);
    if (existing === undefined) {
      owners.set(keyword, entry);
      continue;
    }
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.REGISTRY_CONFLICT,
        severity: "error",
        message: `Schema extension keyword "${keyword}" is registered by both "${existing.pluginId}" and "${entry.pluginId}"`,
        pluginId: entry.pluginId,
        ordinal: pluginOrdinal(snapshots, entry.pluginId),
        registry: "schemaExtensions",
        key: entry.key,
        metadata: {
          registry: "schemaExtensions",
          keyword,
          existingPluginId: existing.pluginId,
          incomingPluginId: entry.pluginId,
          existingKey: existing.key,
          incomingKey: entry.key,
        },
      }),
    );
  }
}

function validateValidatorDescriptor(
  snapshot: PluginSnapshot,
  key: string,
  name: string,
  value: Record<string, unknown>,
  tracked: TrackedDiagnostic[],
): boolean {
  const kind = value.kind;
  if (kind !== "sync" && kind !== "async" && kind !== "schema-adapter") {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" validators descriptor "${key}" must declare kind "sync", "async", or "schema-adapter"`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: "validators",
        key,
        metadata: { registry: "validators", key, name, kind, reason: "invalid-kind" },
      }),
    );
    return false;
  }
  if (kind === "sync" || kind === "async") {
    if (typeof value.validate !== "function") {
      tracked.push(
        trackDiagnostic({
          code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
          severity: "error",
          message: `Plugin "${snapshot.id}" validators descriptor "${key}" must provide validate()`,
          pluginId: snapshot.id,
          ordinal: snapshot.ordinal,
          registry: "validators",
          key,
          metadata: { registry: "validators", key, name, kind, reason: "invalid-validate" },
        }),
      );
      return false;
    }
    return true;
  }
  if (typeof value.validateAll !== "function") {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" validators descriptor "${key}" must provide synchronous validateAll()`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: "validators",
        key,
        metadata: { registry: "validators", key, name, kind, reason: "invalid-validateAll" },
      }),
    );
    return false;
  }
  const capabilities = value.capabilities;
  if (capabilities !== undefined && !isPlainObject(capabilities)) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" validators descriptor "${key}" capabilities must be a plain object`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: "validators",
        key,
        metadata: { registry: "validators", key, name, kind, reason: "invalid-capabilities" },
      }),
    );
    return false;
  }
  if (capabilities?.validateAt === true && typeof value.validateAt !== "function") {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" validators descriptor "${key}" declared safe validateAt without the method`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: "validators",
        key,
        metadata: {
          registry: "validators",
          key,
          name,
          kind,
          capability: "validateAt",
          reason: "missing-capability-method",
        },
      }),
    );
    return false;
  }
  if (capabilities?.validateAffected === true && typeof value.validateAffected !== "function") {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" validators descriptor "${key}" declared safe validateAffected without the method`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: "validators",
        key,
        metadata: {
          registry: "validators",
          key,
          name,
          kind,
          capability: "validateAffected",
          reason: "missing-capability-method",
        },
      }),
    );
    return false;
  }
  return true;
}

function validateWidgetContribution(
  snapshot: PluginSnapshot,
  key: string,
  value: unknown,
  tracked: TrackedDiagnostic[],
): boolean {
  if (!isPlainObject(value)) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" contributed an invalid widgets descriptor for "${key}"`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: "widgets",
        key,
        metadata: { registry: "widgets", key, reason: "non-plain-descriptor" },
      }),
    );
    return false;
  }
  if (widgetDescriptorHasRuntimeHandler(value)) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" widgets descriptor "${key}" must not include Runtime handlers`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: "widgets",
        key,
        metadata: { registry: "widgets", key, reason: "runtime-handler" },
      }),
    );
    return false;
  }
  const interaction = inspectWidgetInteraction(value.interaction);
  if (!interaction.ok) {
    tracked.push(
      trackDiagnostic({
        code: PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
        severity: "error",
        message: `Plugin "${snapshot.id}" widgets descriptor "${key}" has an invalid interaction contract`,
        pluginId: snapshot.id,
        ordinal: snapshot.ordinal,
        registry: "widgets",
        key,
        metadata: {
          registry: "widgets",
          key,
          reason: interaction.reason,
          ...(interaction.action === undefined ? {} : { action: interaction.action }),
        },
      }),
    );
    return false;
  }
  return true;
}

function storeEntries<T>(store: Map<string, RegistryEntryInspection<T>>): RegistryEntryInspection<T>[] {
  return [...store.values()];
}

function createTypedRegistry<T>(store: Map<string, RegistryEntryInspection<unknown>>): Registry<T> {
  return createRegistry(storeEntries(store) as RegistryEntryInspection<T>[]);
}

function trackDiagnostic(input: {
  code: PluginDiagnosticCode;
  severity: Diagnostic["severity"];
  message: string;
  pluginId?: string;
  ordinal: number;
  registry?: RegistryKind;
  key?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): TrackedDiagnostic {
  const diagnostic: Diagnostic = {
    code: input.code,
    severity: input.severity,
    message: input.message,
    source: "plugin",
    ...(input.pluginId === undefined ? {} : { pluginId: input.pluginId }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  };

  return {
    diagnostic,
    ordinal: input.ordinal,
    codeRank: PLUGIN_DIAGNOSTIC_CODE_RANK[input.code],
    registryIndex: input.registry === undefined ? 99 : REGISTRY_KIND_RANK[input.registry],
    key: input.key ?? "",
  };
}

function sortDiagnostics(items: readonly TrackedDiagnostic[]): Diagnostic[] {
  return items
    .slice()
    .sort((left, right) => {
      if (left.ordinal !== right.ordinal) {
        return left.ordinal - right.ordinal;
      }
      if (left.codeRank !== right.codeRank) {
        return left.codeRank - right.codeRank;
      }
      if (left.registryIndex !== right.registryIndex) {
        return left.registryIndex - right.registryIndex;
      }
      if (left.key !== right.key) {
        return left.key < right.key ? -1 : 1;
      }
      return 0;
    })
    .map((item) => item.diagnostic);
}
