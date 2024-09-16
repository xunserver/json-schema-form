import type { Diagnostic } from "@xunserver-jsf/core";
import { RENDERER_DIAGNOSTIC_CODE_RANK, RENDERER_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { freezeAdapterDiagnostic, RendererEnvironmentBuildError } from "./errors.js";
import {
  isProtocolCompatible,
  isWellFormedProtocolVersion,
  VUE_RENDERER_PROTOCOL,
  type ProtocolCompatibility,
} from "./protocol.js";
import { createVueRegistry } from "./registry.js";
import type {
  CreateVueRendererEnvironmentOptions,
  FormAdapter,
  FieldChromeAdapter,
  LayoutBinding,
  ResolvedVueAdapter,
  VueAdapterContribution,
  VueRegistryEntryInspection,
  VueRegistryKind,
  VueRegistryOverride,
  VueRendererEnvironment,
  VueUIAdapter,
  WidgetBinding,
} from "./types.js";

interface TrackedDiagnostic {
  readonly diagnostic: Diagnostic;
  readonly ordinal: number;
  readonly codeRank: number;
  readonly key: string;
}

interface AdapterSnapshot {
  readonly ordinal: number;
  readonly validShape: boolean;
  readonly id: string;
  readonly protocol: unknown;
  readonly form: unknown;
  readonly fieldChrome: unknown;
  readonly widgets: Readonly<Record<string, unknown>>;
  readonly layouts: Readonly<Record<string, unknown>>;
}

const ROLE_KEYS = ["form", "fieldChrome", "widgets", "layouts"] as const;

/** 校验 adapter / contribution / override 后冻结 Vue Renderer Environment。 */
export function createVueRendererEnvironment(
  options: CreateVueRendererEnvironmentOptions,
): VueRendererEnvironment {
  const adapters = options.adapters === undefined ? [] : [...options.adapters];
  const contributions = options.contributions === undefined ? [] : [...options.contributions];
  const overrides = options.overrides === undefined ? [] : [...options.overrides];
  const tracked: TrackedDiagnostic[] = [];

  const snapshots = adapters.map((adapter, index) => snapshotAdapter(adapter, index));
  for (const snapshot of snapshots) {
    if (!snapshot.validShape) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
          message: "VueUIAdapter must be a plain object",
          ordinal: snapshot.ordinal,
          metadata: { reason: "non-plain-adapter" },
        }),
      );
      continue;
    }
    if (!isValidId(snapshot.id)) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.INVALID_ID,
          message: "Adapter id must be a non-empty string without leading or trailing whitespace",
          ordinal: snapshot.ordinal,
          metadata: { id: snapshot.id },
        }),
      );
    }
  }

  const firstById = new Map<string, AdapterSnapshot>();
  for (const snapshot of snapshots) {
    if (!snapshot.validShape || !isValidId(snapshot.id)) {
      continue;
    }
    const existing = firstById.get(snapshot.id);
    if (existing !== undefined) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.DUPLICATE_ID,
          message: `Duplicate adapter id "${snapshot.id}"`,
          ordinal: snapshot.ordinal,
          pluginId: snapshot.id,
          metadata: { adapterId: snapshot.id, firstOrdinal: existing.ordinal },
        }),
      );
      continue;
    }
    firstById.set(snapshot.id, snapshot);
  }

  for (const snapshot of firstById.values()) {
    const compatibility = readCompatibility(snapshot.protocol);
    if (compatibility === undefined) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.PROTOCOL_INCOMPATIBLE,
          message: `Adapter "${snapshot.id}" protocol is malformed`,
          ordinal: snapshot.ordinal,
          pluginId: snapshot.id,
          metadata: { adapterId: snapshot.id, requested: snapshot.protocol },
        }),
      );
      continue;
    }
    if (!isProtocolCompatible(compatibility)) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.PROTOCOL_INCOMPATIBLE,
          message: `Adapter "${snapshot.id}" is incompatible with Vue renderer protocol ${formatProtocol()}`,
          ordinal: snapshot.ordinal,
          pluginId: snapshot.id,
          metadata: {
            adapterId: snapshot.id,
            requested: freezeCompatibility(compatibility),
            current: freezeVersion(),
          },
        }),
      );
    }
    validateRole(snapshot, "form", snapshot.form, tracked, isFormAdapter);
    validateRole(snapshot, "fieldChrome", snapshot.fieldChrome, tracked, isFieldChromeAdapter);
    if (!isRecord(snapshot.widgets)) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.MISSING_ROLE,
          message: `Adapter "${snapshot.id}" is missing widgets registry`,
          ordinal: snapshot.ordinal,
          pluginId: snapshot.id,
          metadata: { adapterId: snapshot.id, role: "widgets" },
        }),
      );
    }
    if (!isRecord(snapshot.layouts)) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.MISSING_ROLE,
          message: `Adapter "${snapshot.id}" is missing layouts registry`,
          ordinal: snapshot.ordinal,
          pluginId: snapshot.id,
          metadata: { adapterId: snapshot.id, role: "layouts" },
        }),
      );
    }
  }

  for (const override of overrides) {
    if (isWildcardOverride(override)) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.OVERRIDE_WILDCARD,
          message: "Renderer registry override must name exact adapter, registry, key, and owners",
          metadata: {
            adapterId: override.adapterId,
            registry: override.registry,
            key: override.key,
            expectedOwner: override.expectedOwner,
            replacementOwner: override.replacementOwner,
          },
        }),
      );
    }
  }

  const widgetStores = new Map<string, Map<string, VueRegistryEntryInspection<WidgetBinding>>>();
  const layoutStores = new Map<string, Map<string, VueRegistryEntryInspection<LayoutBinding>>>();
  const consumedOverrides = new Set<VueRegistryOverride>();

  for (const snapshot of firstById.values()) {
    if (isRecord(snapshot.widgets)) {
      const widgets = new Map<string, VueRegistryEntryInspection<WidgetBinding>>();
      widgetStores.set(snapshot.id, widgets);
      registerBindings(
        snapshot.id,
        snapshot.id,
        snapshot.ordinal,
        "widgets",
        snapshot.widgets,
        widgets,
        overrides,
        consumedOverrides,
        tracked,
        isWidgetBinding,
      );
    }
    if (isRecord(snapshot.layouts)) {
      const layouts = new Map<string, VueRegistryEntryInspection<LayoutBinding>>();
      layoutStores.set(snapshot.id, layouts);
      registerBindings(
        snapshot.id,
        snapshot.id,
        snapshot.ordinal,
        "layouts",
        snapshot.layouts,
        layouts,
        overrides,
        consumedOverrides,
        tracked,
        isLayoutBinding,
      );
    }
  }

  contributions.forEach((contribution, index) => {
    const ordinal = snapshots.length + index;
    if (!isValidId(contribution.owner) || !isValidId(contribution.adapterId)) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.INVALID_ID,
          message: "Contribution owner and adapterId must be non-empty strings",
          ordinal,
          metadata: { owner: contribution.owner, adapterId: contribution.adapterId },
        }),
      );
      return;
    }
    if (!firstById.has(contribution.adapterId)) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR,
          message: `Contribution owner "${contribution.owner}" targets unknown adapter "${contribution.adapterId}"`,
          ordinal,
          pluginId: contribution.owner,
          metadata: { adapterId: contribution.adapterId, owner: contribution.owner },
        }),
      );
      return;
    }
    if (contribution.widgets !== undefined) {
      let widgets = widgetStores.get(contribution.adapterId);
      if (widgets === undefined) {
        widgets = new Map();
        widgetStores.set(contribution.adapterId, widgets);
      }
      registerBindings(
        contribution.adapterId,
        contribution.owner,
        ordinal,
        "widgets",
        contribution.widgets,
        widgets,
        overrides,
        consumedOverrides,
        tracked,
        isWidgetBinding,
      );
    }
    if (contribution.layouts !== undefined) {
      let layouts = layoutStores.get(contribution.adapterId);
      if (layouts === undefined) {
        layouts = new Map();
        layoutStores.set(contribution.adapterId, layouts);
      }
      registerBindings(
        contribution.adapterId,
        contribution.owner,
        ordinal,
        "layouts",
        contribution.layouts,
        layouts,
        overrides,
        consumedOverrides,
        tracked,
        isLayoutBinding,
      );
    }
  });

  for (const override of overrides) {
    if (isWildcardOverride(override) || consumedOverrides.has(override)) {
      continue;
    }
    tracked.push(
      track({
        code: RENDERER_DIAGNOSTIC_CODES.OVERRIDE_UNUSED,
        message: `Unused override for ${override.registry} key "${override.key}"`,
        pluginId: override.replacementOwner,
        metadata: {
          adapterId: override.adapterId,
          registry: override.registry,
          key: override.key,
          expectedOwner: override.expectedOwner,
          replacementOwner: override.replacementOwner,
        },
      }),
    );
  }

  const blocking = tracked
    .filter((item) => item.diagnostic.severity === "error")
    .sort(compareTracked)
    .map((item) => item.diagnostic);

  if (blocking.length > 0) {
    throw new RendererEnvironmentBuildError(blocking);
  }

  const resolved: ResolvedVueAdapter[] = [];
  for (const snapshot of firstById.values()) {
    const widgets = widgetStores.get(snapshot.id);
    const layouts = layoutStores.get(snapshot.id);
    if (widgets === undefined || layouts === undefined) {
      continue;
    }
    resolved.push(
      Object.freeze({
        id: snapshot.id,
        protocol: VUE_RENDERER_PROTOCOL,
        form: snapshot.form as FormAdapter,
        fieldChrome: snapshot.fieldChrome as FieldChromeAdapter,
        widgets: createVueRegistry(snapshot.id, "widgets", [...widgets.values()]),
        layouts: createVueRegistry(snapshot.id, "layouts", [...layouts.values()]),
      }),
    );
  }

  const byId = new Map(resolved.map((adapter) => [adapter.id, adapter]));
  const environment: VueRendererEnvironment = {
    protocol: VUE_RENDERER_PROTOCOL,
    adapterIds: Object.freeze(resolved.map((adapter) => adapter.id)),
    getAdapter(id) {
      return byId.get(id);
    },
    inspect(adapterId, registry, key) {
      const adapter = byId.get(adapterId);
      if (adapter === undefined) {
        return undefined;
      }
      return registry === "widgets" ? adapter.widgets.inspect(key) : adapter.layouts.inspect(key);
    },
  };
  return Object.freeze(environment);
}

function registerBindings<T>(
  adapterId: string,
  owner: string,
  ordinal: number,
  registry: VueRegistryKind,
  record: Readonly<Record<string, unknown>>,
  store: Map<string, VueRegistryEntryInspection<T>>,
  overrides: readonly VueRegistryOverride[],
  consumedOverrides: Set<VueRegistryOverride>,
  tracked: TrackedDiagnostic[],
  validate: (value: unknown) => value is T,
): void {
  for (const key of Object.keys(record).sort()) {
    const incoming = record[key];
    if (!validate(incoming)) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.INVALID_BINDING,
          message: `Adapter "${adapterId}" has an invalid ${registry} binding for "${key}"`,
          ordinal,
          pluginId: owner,
          metadata: { adapterId, registry, key, owner },
        }),
      );
      continue;
    }
    const existing = store.get(key);
    if (existing === undefined) {
      store.set(key, Object.freeze({ key, owner, adapterId, registry, value: incoming }));
      continue;
    }
    const override = overrides.find(
      (item) =>
        !isWildcardOverride(item) &&
        item.adapterId === adapterId &&
        item.registry === registry &&
        item.key === key,
    );
    if (override === undefined) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.REGISTRY_CONFLICT,
          message: `Registry conflict for ${registry} key "${key}" on adapter "${adapterId}" between "${existing.owner}" and "${owner}"`,
          ordinal,
          pluginId: owner,
          metadata: {
            adapterId,
            registry,
            key,
            existingOwner: existing.owner,
            incomingOwner: owner,
          },
        }),
      );
      continue;
    }
    if (override.expectedOwner !== existing.owner || override.replacementOwner !== owner) {
      tracked.push(
        track({
          code: RENDERER_DIAGNOSTIC_CODES.OVERRIDE_OWNER_MISMATCH,
          message: `Override owners do not match ${registry} key "${key}" on adapter "${adapterId}"`,
          ordinal,
          pluginId: owner,
          metadata: {
            adapterId,
            registry,
            key,
            expectedOwner: override.expectedOwner,
            replacementOwner: override.replacementOwner,
            existingOwner: existing.owner,
            incomingOwner: owner,
          },
        }),
      );
      continue;
    }
    consumedOverrides.add(override);
    store.set(key, Object.freeze({ key, owner, adapterId, registry, value: incoming }));
  }
}

function snapshotAdapter(adapter: VueUIAdapter, ordinal: number): AdapterSnapshot {
  if (!isRecord(adapter)) {
    return {
      ordinal,
      validShape: false,
      id: "",
      protocol: undefined,
      form: undefined,
      fieldChrome: undefined,
      widgets: {},
      layouts: {},
    };
  }
  return {
    ordinal,
    validShape: true,
    id: typeof adapter.id === "string" ? adapter.id : "",
    protocol: adapter.protocol,
    form: adapter.form,
    fieldChrome: adapter.fieldChrome,
    widgets: isRecord(adapter.widgets) ? adapter.widgets : (undefined as unknown as Record<string, unknown>),
    layouts: isRecord(adapter.layouts) ? adapter.layouts : (undefined as unknown as Record<string, unknown>),
  };
}

function validateRole(
  snapshot: AdapterSnapshot,
  role: (typeof ROLE_KEYS)[number],
  value: unknown,
  tracked: TrackedDiagnostic[],
  validate: (value: unknown) => boolean,
): void {
  if (!validate(value)) {
    tracked.push(
      track({
        code: RENDERER_DIAGNOSTIC_CODES.MISSING_ROLE,
        message: `Adapter "${snapshot.id}" is missing a valid ${role} role`,
        ordinal: snapshot.ordinal,
        pluginId: snapshot.id,
        metadata: { adapterId: snapshot.id, role },
      }),
    );
  }
}

function isFormAdapter(value: unknown): value is FormAdapter {
  return isRecord(value) && typeof value.render === "function";
}

function isFieldChromeAdapter(value: unknown): value is FieldChromeAdapter {
  return isRecord(value) && typeof value.render === "function";
}

function isWidgetBinding(value: unknown): value is WidgetBinding {
  if (!isRecord(value)) {
    return false;
  }
  const codec = value.codec;
  const interaction = value.interaction;
  return (
    isRecord(codec) &&
    typeof codec.encode === "function" &&
    typeof codec.decode === "function" &&
    typeof value.render === "function" &&
    isRecord(interaction) &&
    interaction.setValue === true &&
    (value.mapProps === undefined || typeof value.mapProps === "function") &&
    (value.custom === undefined || typeof value.custom === "boolean")
  );
}

function isLayoutBinding(value: unknown): value is LayoutBinding {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.render === "function";
}

function isWildcardOverride(override: VueRegistryOverride): boolean {
  return [override.adapterId, override.registry, override.key, override.expectedOwner, override.replacementOwner].some(
    (item) => item === "*" || item === "",
  );
}

function readCompatibility(value: unknown): ProtocolCompatibility | undefined {
  if (!isRecord(value) || !isRecord(value.min)) {
    return undefined;
  }
  if (!isWellFormedProtocolVersion(value.min)) {
    return undefined;
  }
  if (value.maxExclusive !== undefined && !isWellFormedProtocolVersion(value.maxExclusive)) {
    return undefined;
  }
  return {
    min: value.min,
    ...(value.maxExclusive === undefined ? {} : { maxExclusive: value.maxExclusive }),
  };
}

function freezeCompatibility(value: ProtocolCompatibility): ProtocolCompatibility {
  return Object.freeze({
    min: freezeVersion(value.min),
    ...(value.maxExclusive === undefined ? {} : { maxExclusive: freezeVersion(value.maxExclusive) }),
  });
}

function freezeVersion(version = VUE_RENDERER_PROTOCOL) {
  return Object.freeze({ major: version.major, minor: version.minor });
}

function formatProtocol(): string {
  return `${VUE_RENDERER_PROTOCOL.major}.${VUE_RENDERER_PROTOCOL.minor}`;
}

function isValidId(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value === value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function track(input: {
  code: (typeof RENDERER_DIAGNOSTIC_CODES)[keyof typeof RENDERER_DIAGNOSTIC_CODES];
  message: string;
  ordinal?: number;
  pluginId?: string;
  metadata?: Readonly<Record<string, unknown>>;
}): TrackedDiagnostic {
  const diagnostic: Diagnostic = freezeAdapterDiagnostic({
    code: input.code,
    severity: "error",
    message: input.message,
    source: "adapter",
    ...(input.pluginId === undefined ? {} : { pluginId: input.pluginId }),
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  });
  return {
    diagnostic,
    ordinal: input.ordinal ?? 0,
    codeRank: RENDERER_DIAGNOSTIC_CODE_RANK[input.code],
    key: `${input.code}:${input.pluginId ?? ""}:${JSON.stringify(input.metadata ?? {})}`,
  };
}

function compareTracked(left: TrackedDiagnostic, right: TrackedDiagnostic): number {
  if (left.codeRank !== right.codeRank) {
    return left.codeRank - right.codeRank;
  }
  if (left.ordinal !== right.ordinal) {
    return left.ordinal - right.ordinal;
  }
  return left.key.localeCompare(right.key);
}
