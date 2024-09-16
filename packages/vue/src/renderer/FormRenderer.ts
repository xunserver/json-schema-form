import type { Diagnostic, FormInstance, SubmitHandler } from "@xunserver-jsf/core";
import { getRenderScope } from "@xunserver-jsf/core/runtime";
import { defineComponent, h, type PropType } from "vue";
import { createVueRendererEnvironment } from "../adapter/create-environment.js";
import { RENDERER_DIAGNOSTIC_CODES } from "../adapter/diagnostic-codes.js";
import { freezeAdapterDiagnostic, RendererCapabilityError } from "../adapter/errors.js";
import { preflightCapabilities } from "../adapter/preflight.js";
import type { VueRendererEnvironment, VueUIAdapter } from "../adapter/types.js";
import { useFormIdPrefix } from "../composables/ids.js";
import { provideRendererContext } from "../context/renderer-context.js";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import { registerViewRenderers } from "./register.js";
import { ViewRenderer } from "./ViewRenderer.js";

registerViewRenderers();

const ENVIRONMENT_CACHE = new WeakMap<VueUIAdapter, VueRendererEnvironment>();

/** 根渲染器。`adapter` 与 `environment`+`adapterId` 必须二选一。 */
export const FormRenderer = defineComponent({
  name: "FormRenderer",
  props: {
    form: { type: Object as PropType<FormInstance>, required: true },
    adapter: { type: Object as PropType<VueUIAdapter>, required: false },
    environment: { type: Object as PropType<VueRendererEnvironment>, required: false },
    adapterId: { type: String, required: false },
    idPrefix: { type: String, required: false },
    submitHandler: { type: Function as PropType<SubmitHandler>, required: false },
    onDiagnostic: { type: Function as PropType<(diagnostic: Diagnostic) => void>, required: false },
  },
  setup(props) {
    const report = (diagnostic: Diagnostic): void => {
      props.onDiagnostic?.(diagnostic);
    };
    const resolved = resolveRendererInput(props, report);
    preflightCapabilities(props.form, resolved.adapter, report);
    const prefix = useFormIdPrefix(props.idPrefix);
    const scope = getRenderScope(props.form);
    provideRendererContext({
      form: props.form,
      environment: resolved.environment,
      adapter: resolved.adapter,
      scope,
      idPrefix: prefix,
      reportDiagnostic: report,
      focusedView: { current: undefined },
    });
    return () => {
      const content = h(ViewRenderer, { node: props.form.model.ui.viewTree });
      return wrapAdapterCall(
        () =>
          resolved.adapter.form.render({
            ids: { form: `${prefix}-form` },
            submit: () => {
              if (props.submitHandler !== undefined) {
                void props.form.submit(props.submitHandler);
              }
            },
            content,
          }),
        { adapterId: resolved.adapter.id, key: "form" },
        report,
      );
    };
  },
});

function resolveRendererInput(
  props: {
    readonly adapter?: VueUIAdapter | undefined;
    readonly environment?: VueRendererEnvironment | undefined;
    readonly adapterId?: string | undefined;
  },
  report: (diagnostic: Diagnostic) => void,
): { readonly environment: VueRendererEnvironment; readonly adapter: NonNullable<ReturnType<VueRendererEnvironment["getAdapter"]>> } {
  const hasAdapter = props.adapter !== undefined;
  const hasEnvironment = props.environment !== undefined;
  if (hasAdapter === hasEnvironment) {
    const diagnostic = freezeAdapterDiagnostic({
      code: RENDERER_DIAGNOSTIC_CODES.CONFIG,
      severity: "error",
      message: "FormRenderer requires exactly one of adapter or environment",
      source: "adapter",
      metadata: { hasAdapter, hasEnvironment, adapterId: props.adapterId },
    });
    report(diagnostic);
    throw new RendererCapabilityError([diagnostic]);
  }
  if (props.adapter !== undefined) {
    const environment = environmentForAdapter(props.adapter);
    const adapter = environment.getAdapter(props.adapter.id);
    if (adapter === undefined) {
      const diagnostic = freezeAdapterDiagnostic({
        code: RENDERER_DIAGNOSTIC_CODES.CONFIG,
        severity: "error",
        message: `Adapter "${props.adapter.id}" is missing from the cached environment`,
        source: "adapter",
        pluginId: props.adapter.id,
        metadata: { adapterId: props.adapter.id },
      });
      report(diagnostic);
      throw new RendererCapabilityError([diagnostic]);
    }
    return { environment, adapter };
  }
  const environment = props.environment!;
  const adapterId = props.adapterId ?? environment.adapterIds[0];
  if (adapterId === undefined) {
    const diagnostic = freezeAdapterDiagnostic({
      code: RENDERER_DIAGNOSTIC_CODES.CONFIG,
      severity: "error",
      message: "Renderer environment does not contain an adapter",
      source: "adapter",
    });
    report(diagnostic);
    throw new RendererCapabilityError([diagnostic]);
  }
  const adapter = environment.getAdapter(adapterId);
  if (adapter === undefined) {
    const diagnostic = freezeAdapterDiagnostic({
      code: RENDERER_DIAGNOSTIC_CODES.CONFIG,
      severity: "error",
      message: `Renderer environment has no adapter "${adapterId}"`,
      source: "adapter",
      pluginId: adapterId,
      metadata: { adapterId },
    });
    report(diagnostic);
    throw new RendererCapabilityError([diagnostic]);
  }
  return { environment, adapter };
}

function environmentForAdapter(adapter: VueUIAdapter): VueRendererEnvironment {
  const cached = ENVIRONMENT_CACHE.get(adapter);
  if (cached !== undefined) {
    return cached;
  }
  const created = createVueRendererEnvironment({ adapters: [adapter] });
  ENVIRONMENT_CACHE.set(adapter, created);
  return created;
}
