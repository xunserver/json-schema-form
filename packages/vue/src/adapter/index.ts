export { defineVueUIAdapter } from "./define-adapter.js";
export { createVueRendererEnvironment } from "./create-environment.js";
export { VUE_RENDERER_PROTOCOL } from "./protocol.js";
export { RENDERER_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
export {
  freezeAdapterDiagnostic,
  RendererAdapterError,
  RendererCapabilityError,
  RendererEnvironmentBuildError,
} from "./errors.js";
export { preflightCapabilities } from "./preflight.js";
export type {
  AdapterDiagnosticObserver,
  CodecFailure,
  CodecResult,
  CodecSuccess,
  CreateVueRendererEnvironmentOptions,
  FieldChromeAdapter,
  FieldChromeRenderInput,
  FieldDomIds,
  FormAdapter,
  FormAdapterRenderInput,
  LayoutBinding,
  LayoutKind,
  LayoutRenderInput,
  LayoutSemanticActions,
  ResolvedVueAdapter,
  SemanticActions,
  ValueCodec,
  VueAdapterContribution,
  VueRegistry,
  VueRegistryEntryInspection,
  VueRegistryKind,
  VueRegistryOverride,
  VueRendererEnvironment,
  VueUIAdapter,
  WidgetBinding,
  WidgetRenderInput,
} from "./types.js";
export type { ProtocolCompatibility, ProtocolVersion } from "./protocol.js";
export type { RendererDiagnosticCode } from "./diagnostic-codes.js";
