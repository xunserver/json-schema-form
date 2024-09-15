import type { FieldView } from "@form/core";
import { useEffect, type ReactNode } from "react";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import type { SemanticActions, WidgetRenderInput } from "../adapter/types.js";
import { useRendererContext } from "../context/renderer-context.js";
import { useFieldDomIds } from "../hooks/ids.js";
import { useFieldSnapshot, usePresentableErrors, useViewSnapshot } from "../hooks/snapshots.js";

export function FieldRenderer({ node }: { readonly node: FieldView }): ReactNode {
  const ctx = useRendererContext();
  const instancePath = ctx.scope.resolve(node.fieldPath);
  const fieldSnapshot = useFieldSnapshot(instancePath);
  const viewSnapshot = useViewSnapshot(node.id);
  const presentableErrors = usePresentableErrors(instancePath);
  const ids = useFieldDomIds(node.id, presentableErrors.length);

  const hidden = !fieldSnapshot.active || !fieldSnapshot.visible;

  useEffect(() => {
    if (hidden && ctx.focusedView.current === node.id) {
      ctx.form.blur(node.id);
      ctx.focusedView.current = undefined;
    }
  }, [hidden, ctx.focusedView, ctx.form, node.id]);

  useEffect(() => {
    return () => {
      if (ctx.focusedView.current === node.id) {
        ctx.form.blur(node.id);
        ctx.focusedView.current = undefined;
      }
    };
  }, [ctx.focusedView, ctx.form, node.id]);

  if (hidden) {
    return null;
  }

  const field = ctx.form.model.ui.fields.get(node.fieldPath);
  if (field === undefined) {
    return null;
  }
  const binding = ctx.adapter.widgets.get(field.widget);
  if (binding === undefined) {
    return null;
  }

  const actions: SemanticActions = {
    setValue(canonicalValue) {
      ctx.form.setValue(instancePath, canonicalValue);
    },
    touch() {
      ctx.form.touch(instancePath);
    },
    focus() {
      if (ctx.focusedView.current !== undefined && ctx.focusedView.current !== node.id) {
        ctx.form.blur(ctx.focusedView.current);
      }
      ctx.form.focus(node.id);
      ctx.focusedView.current = node.id;
    },
    blur() {
      ctx.form.touch(instancePath);
      ctx.form.blur(node.id);
      if (ctx.focusedView.current === node.id) {
        ctx.focusedView.current = undefined;
      }
    },
  };

  const input: WidgetRenderInput = {
    field,
    view: node,
    scope: ctx.scope,
    value: fieldSnapshot.value,
    fieldSnapshot,
    viewSnapshot,
    presentableErrors,
    ids,
    nativeProps: Object.freeze({}),
    actions,
    reportDiagnostic: ctx.reportDiagnostic,
  };

  let nativeProps = input.nativeProps;
  if (binding.mapProps !== undefined) {
    nativeProps = wrapAdapterCall(
      () => binding.mapProps!(input),
      {
        adapterId: ctx.adapter.id,
        key: field.widget,
        viewId: node.id,
        modelPath: field.path,
      },
      ctx.reportDiagnostic,
    );
  }
  const widgetInput: WidgetRenderInput = { ...input, nativeProps };
  const control = wrapAdapterCall(
    () => binding.render(widgetInput),
    {
      adapterId: ctx.adapter.id,
      key: field.widget,
      viewId: node.id,
      modelPath: field.path,
    },
    ctx.reportDiagnostic,
  );
  return wrapAdapterCall(
    () =>
      ctx.adapter.fieldChrome.render({
        field,
        view: node,
        fieldSnapshot,
        viewSnapshot,
        presentableErrors,
        ids,
        control,
      }),
    {
      adapterId: ctx.adapter.id,
      key: "fieldChrome",
      viewId: node.id,
      modelPath: field.path,
    },
    ctx.reportDiagnostic,
  );
}
