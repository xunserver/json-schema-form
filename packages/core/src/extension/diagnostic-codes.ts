export const PLUGIN_DIAGNOSTIC_CODES = Object.freeze({
  INVALID_ID: "plugin.invalid-id",
  INVALID_DESCRIPTOR: "plugin.invalid-descriptor",
  DUPLICATE_ID: "plugin.duplicate-id",
  MISSING_DEPENDENCY: "plugin.missing-dependency",
  DEPENDENCY_CYCLE: "plugin.dependency-cycle",
  PROTOCOL_INCOMPATIBLE: "plugin.protocol-incompatible",
  REGISTRY_CONFLICT: "plugin.registry-conflict",
  REGISTRY_OVERRIDE: "plugin.registry-override",
});

export type PluginDiagnosticCode =
  (typeof PLUGIN_DIAGNOSTIC_CODES)[keyof typeof PLUGIN_DIAGNOSTIC_CODES];

export const PLUGIN_DIAGNOSTIC_CODE_RANK: Readonly<Record<PluginDiagnosticCode, number>> =
  Object.freeze({
    [PLUGIN_DIAGNOSTIC_CODES.INVALID_ID]: 0,
    [PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR]: 1,
    [PLUGIN_DIAGNOSTIC_CODES.DUPLICATE_ID]: 2,
    [PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_INCOMPATIBLE]: 3,
    [PLUGIN_DIAGNOSTIC_CODES.MISSING_DEPENDENCY]: 4,
    [PLUGIN_DIAGNOSTIC_CODES.DEPENDENCY_CYCLE]: 5,
    [PLUGIN_DIAGNOSTIC_CODES.REGISTRY_CONFLICT]: 6,
    [PLUGIN_DIAGNOSTIC_CODES.REGISTRY_OVERRIDE]: 7,
  });
