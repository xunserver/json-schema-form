import type { Diagnostic, FormInstance, SubmitHandler } from "@xunserver-jsf/core";
import { getRenderScope } from "@xunserver-jsf/core/runtime";
import { useMemo, useRef, type ReactElement } from "react";
import { createReactRendererEnvironment } from "../adapter/create-environment.js";
import { RENDERER_DIAGNOSTIC_CODES } from "../adapter/diagnostic-codes.js";
import { freezeAdapterDiagnostic, RendererCapabilityError } from "../adapter/errors.js";
import { preflightCapabilities } from "../adapter/preflight.js";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import type { ReactRendererEnvironment, ReactUIAdapter, ResolvedReactAdapter } from "../adapter/types.js";
import { RendererProvider, type FormRendererContext } from "../context/renderer-context.js";
import { useFormIdentifierPrefix } from "../hooks/ids.js";
import { ViewRenderer } from "./ViewRenderer.js";

const ENVIRONMENT_CACHE = new WeakMap<ReactUIAdapter, ReactRendererEnvironment>();

export interface FormRendererProps {
  readonly form: FormInstance;
  readonly adapter?: ReactUIAdapter;
  readonly environment?: ReactRendererEnvironment;
  readonly adapterId?: string;
  readonly identifierPrefix?: string;
  readonly submitHandler?: SubmitHandler;
  readonly onDiagnostic?: (diagnostic: Diagnostic) => void;
}

/** 根渲染器。`adapter` 与 `environment`+`adapterId` 必须二选一。 */
export function FormRenderer(props: FormRendererProps): ReactElement {
  const identifierPrefix = useFormIdentifierPrefix(props.identifierPrefix);
  const focusedView = useRef<FormRendererContext["focusedView"]["current"]>(undefined);
  const report = props.onDiagnostic ?? noopDiagnostic;
  const resolved = resolveRendererInput(props, report);
  preflightCapabilities(props.form, resolved.adapter, report);
  const scope = getRenderScope(props.form);
  const value = useMemo(
    () =>
      Object.freeze({
        form: props.form,
        adapter: resolved.adapter,
        scope,
        identifierPrefix,
        reportDiagnostic: report,
        focusedView,
      }) satisfies FormRendererContext,
    [props.form, resolved.adapter, scope, identifierPrefix, report, focusedView],
  );
  const content = <ViewRenderer node={props.form.model.ui.viewTree} />;
  const formElement = wrapAdapterCall(
    () =>
      resolved.adapter.form.render({
        ids: { form: `${identifierPrefix}-form` },
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
  return <RendererProvider value={value}>{formElement}</RendererProvider>;
}

function noopDiagnostic(_diagnostic: Diagnostic): void {}

function resolveRendererInput(
  props: {
    readonly adapter?: ReactUIAdapter | undefined;
    readonly environment?: ReactRendererEnvironment | undefined;
    readonly adapterId?: string | undefined;
  },
  report: (diagnostic: Diagnostic) => void,
): { readonly environment: ReactRendererEnvironment; readonly adapter: ResolvedReactAdapter } {
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

function environmentForAdapter(adapter: ReactUIAdapter): ReactRendererEnvironment {
  const cached = ENVIRONMENT_CACHE.get(adapter);
  if (cached !== undefined) {
    return cached;
  }
  const created = createReactRendererEnvironment({ adapters: [adapter] });
  ENVIRONMENT_CACHE.set(adapter, created);
  return created;
}
