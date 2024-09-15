export const RUNTIME_DIAGNOSTIC_CODES = Object.freeze({
  INVALID_MODEL: "runtime.invalid-model",
  INVALID_VALUE: "runtime.invalid-value",
  INVALID_PATH: "runtime.invalid-path",
  UNKNOWN_PATH: "runtime.unknown-path",
  UNKNOWN_FIELD: "runtime.unknown-field",
  UNKNOWN_VIEW: "runtime.unknown-view",
  ENVIRONMENT_MISMATCH: "runtime.environment-mismatch",
  ARRAY_BINDING_UNAVAILABLE: "runtime.array-binding-unavailable",
  TRANSACTION_LIMIT: "runtime.transaction-limit",
  PHASE_FAILED: "runtime.phase-failed",
  SUBSCRIBER_THREW: "runtime.subscriber-threw",
  INSTRUMENTATION_THREW: "runtime.instrumentation-threw",
  INVALID_SELECTOR: "runtime.invalid-selector",
  INVALID_COMMAND: "runtime.invalid-command",
});

export type RuntimeDiagnosticCode =
  (typeof RUNTIME_DIAGNOSTIC_CODES)[keyof typeof RUNTIME_DIAGNOSTIC_CODES];

export const RUNTIME_DIAGNOSTIC_CODE_RANK: Readonly<Record<RuntimeDiagnosticCode, number>> =
  Object.freeze({
    [RUNTIME_DIAGNOSTIC_CODES.INVALID_MODEL]: 0,
    [RUNTIME_DIAGNOSTIC_CODES.ENVIRONMENT_MISMATCH]: 1,
    [RUNTIME_DIAGNOSTIC_CODES.INVALID_PATH]: 2,
    [RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH]: 3,
    [RUNTIME_DIAGNOSTIC_CODES.ARRAY_BINDING_UNAVAILABLE]: 4,
    [RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_FIELD]: 5,
    [RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_VIEW]: 6,
    [RUNTIME_DIAGNOSTIC_CODES.INVALID_VALUE]: 7,
    [RUNTIME_DIAGNOSTIC_CODES.INVALID_SELECTOR]: 8,
    [RUNTIME_DIAGNOSTIC_CODES.INVALID_COMMAND]: 9,
    [RUNTIME_DIAGNOSTIC_CODES.TRANSACTION_LIMIT]: 10,
    [RUNTIME_DIAGNOSTIC_CODES.PHASE_FAILED]: 11,
    [RUNTIME_DIAGNOSTIC_CODES.SUBSCRIBER_THREW]: 12,
    [RUNTIME_DIAGNOSTIC_CODES.INSTRUMENTATION_THREW]: 13,
  });
