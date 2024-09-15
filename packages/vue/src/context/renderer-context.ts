import type { Diagnostic, FormInstance, ViewNodeId } from "@form/core";
import type { RenderScope } from "@form/core/runtime";
import { type InjectionKey, inject, provide } from "vue";
import type { ResolvedVueAdapter, VueRendererEnvironment } from "../adapter/types.js";

export interface FormRendererContext {
  readonly form: FormInstance;
  readonly environment: VueRendererEnvironment;
  readonly adapter: ResolvedVueAdapter;
  readonly scope: RenderScope;
  readonly idPrefix: string;
  readonly reportDiagnostic: (diagnostic: Diagnostic) => void;
  readonly focusedView: { current: ViewNodeId | undefined };
}

export const FORM_RENDERER_CONTEXT: InjectionKey<FormRendererContext> = Symbol("form-renderer-context");

export function provideRendererContext(context: FormRendererContext): FormRendererContext {
  const frozen = Object.freeze(context);
  provide(FORM_RENDERER_CONTEXT, frozen);
  return frozen;
}

export function useRendererContext(): FormRendererContext {
  const context = inject(FORM_RENDERER_CONTEXT);
  if (context === undefined) {
    throw new Error("Vue form renderer context is missing");
  }
  return context;
}

export function provideChildScope(scope: RenderScope): FormRendererContext {
  const parent = useRendererContext();
  return provideRendererContext({
    form: parent.form,
    environment: parent.environment,
    adapter: parent.adapter,
    scope,
    idPrefix: parent.idPrefix,
    reportDiagnostic: parent.reportDiagnostic,
    focusedView: parent.focusedView,
  });
}
