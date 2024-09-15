import type { Diagnostic, FormInstance, ViewNodeId } from "@form/core";
import type { RenderScope } from "@form/core/runtime";
import { createContext, useContext, type ReactNode } from "react";
import type { ResolvedReactAdapter } from "../adapter/types.js";

export interface FormRendererContext {
  readonly form: FormInstance;
  readonly adapter: ResolvedReactAdapter;
  readonly scope: RenderScope;
  readonly identifierPrefix: string;
  readonly reportDiagnostic: (diagnostic: Diagnostic) => void;
  readonly focusedView: { current: ViewNodeId | undefined };
}

const FORM_RENDERER_CONTEXT = createContext<FormRendererContext | undefined>(undefined);

export function useRendererContext(): FormRendererContext {
  const context = useContext(FORM_RENDERER_CONTEXT);
  if (context === undefined) {
    throw new Error("React form renderer context is missing");
  }
  return context;
}

export function RendererProvider({
  value,
  children,
}: {
  readonly value: FormRendererContext;
  readonly children: ReactNode;
}) {
  return <FORM_RENDERER_CONTEXT.Provider value={value}>{children}</FORM_RENDERER_CONTEXT.Provider>;
}

export function RendererScopeProvider({
  scope,
  children,
}: {
  readonly scope: RenderScope;
  readonly children: ReactNode;
}) {
  const parent = useRendererContext();
  const value: FormRendererContext = Object.freeze({
    form: parent.form,
    adapter: parent.adapter,
    scope,
    identifierPrefix: parent.identifierPrefix,
    reportDiagnostic: parent.reportDiagnostic,
    focusedView: parent.focusedView,
  });
  return <FORM_RENDERER_CONTEXT.Provider value={value}>{children}</FORM_RENDERER_CONTEXT.Provider>;
}
