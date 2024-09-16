/**
 * Vue Renderer：`FormRenderer`、只读 composable 与 Adapter 契约。
 *
 * @module @xunserver-jsf/vue
 */
import { registerViewRenderers } from "./renderer/register.js";

registerViewRenderers();

export { FormRenderer } from "./renderer/FormRenderer.js";
export { ViewRenderer } from "./renderer/ViewRenderer.js";
export { FieldRenderer } from "./renderer/FieldRenderer.js";
export { ObjectRenderer } from "./renderer/ObjectRenderer.js";
export { ArrayRenderer } from "./renderer/ArrayRenderer.js";
export { GroupRenderer } from "./renderer/GroupRenderer.js";
export { LayoutRenderer } from "./renderer/LayoutRenderer.js";

export { useRuntimeSelector } from "./composables/use-runtime-selector.js";
export {
  useArrayItem,
  useArrayOrder,
  useArraySnapshot,
  useCurrentBinding,
  useFieldSnapshot,
  useFormSnapshot,
  usePresentableErrors,
  useViewSnapshot,
} from "./composables/snapshots.js";

export {
  createVueRendererEnvironment,
  defineVueUIAdapter,
  freezeAdapterDiagnostic,
  RENDERER_DIAGNOSTIC_CODES,
  RendererAdapterError,
  RendererCapabilityError,
  RendererEnvironmentBuildError,
  VUE_RENDERER_PROTOCOL,
} from "./adapter/index.js";
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
  ProtocolCompatibility,
  ProtocolVersion,
  RendererDiagnosticCode,
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
} from "./adapter/index.js";
