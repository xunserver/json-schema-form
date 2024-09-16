import type { FieldView } from "@xunserver-jsf/core";
import { computed, defineComponent, h, onScopeDispose, type PropType, type VNode } from "vue";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import { createFieldDomIds } from "../composables/ids.js";
import { useFieldChromeSnapshot, useFieldSnapshot, usePresentableErrors, useViewSnapshot } from "../composables/snapshots.js";
import { useRendererContext } from "../context/renderer-context.js";
import type { SemanticActions, WidgetRenderInput } from "../adapter/types.js";
import { viewRenderers } from "./registry.js";

export const FieldRenderer = defineComponent({
  name: "FieldRenderer",
  props: {
    node: { type: Object as PropType<FieldView>, required: true },
  },
  setup(props) {
    const ctx = useRendererContext();
    const instancePath = computed(() => ctx.scope.resolve(props.node.fieldPath));
    const fieldSnapshot = useFieldChromeSnapshot(() => instancePath.value);
    const viewSnapshot = useViewSnapshot(() => props.node.id);
    const presentableErrors = usePresentableErrors(() => instancePath.value);

    onScopeDispose(() => {
      if (ctx.focusedView.current === props.node.id) {
        ctx.form.blur(props.node.id);
        ctx.focusedView.current = undefined;
      }
    });

    return (): VNode | null => {
      if (!fieldSnapshot.value.active || !fieldSnapshot.value.visible) {
        if (ctx.focusedView.current === props.node.id) {
          ctx.form.blur(props.node.id);
          ctx.focusedView.current = undefined;
        }
        return null;
      }
      const field = ctx.form.model.ui.fields.get(props.node.fieldPath);
      if (field === undefined) {
        return null;
      }
      const binding = ctx.adapter.widgets.get(field.widget);
      if (binding === undefined) {
        return null;
      }
      const ids = createFieldDomIds(
        ctx.idPrefix,
        props.node.id,
        ctx.scope.binding.itemChain,
        presentableErrors.value.length,
      );
      return wrapAdapterCall(
        () =>
          ctx.adapter.fieldChrome.render({
            field,
            view: props.node,
            fieldSnapshot: fieldSnapshot.value,
            viewSnapshot: viewSnapshot.value,
            presentableErrors: presentableErrors.value,
            ids,
            control: h(FieldControlRenderer, { node: props.node }),
          }),
        {
          adapterId: ctx.adapter.id,
          key: "fieldChrome",
          viewId: props.node.id,
          modelPath: field.path,
        },
        ctx.reportDiagnostic,
      );
    };
  },
});

const FieldControlRenderer = defineComponent({
  name: "FieldControlRenderer",
  props: {
    node: { type: Object as PropType<FieldView>, required: true },
  },
  setup(props) {
    const ctx = useRendererContext();
    const instancePath = computed(() => ctx.scope.resolve(props.node.fieldPath));
    const fieldSnapshot = useFieldSnapshot(() => instancePath.value);
    const viewSnapshot = useViewSnapshot(() => props.node.id);
    const presentableErrors = usePresentableErrors(() => instancePath.value);

    return (): VNode | null => {
      const field = ctx.form.model.ui.fields.get(props.node.fieldPath);
      if (field === undefined) {
        return null;
      }
      const binding = ctx.adapter.widgets.get(field.widget);
      if (binding === undefined) {
        return null;
      }
      const ids = createFieldDomIds(
        ctx.idPrefix,
        props.node.id,
        ctx.scope.binding.itemChain,
        presentableErrors.value.length,
      );
      const actions: SemanticActions = {
        setValue(canonicalValue) {
          ctx.form.setValue(instancePath.value, canonicalValue);
        },
        touch() {
          ctx.form.touch(instancePath.value);
        },
        focus() {
          if (ctx.focusedView.current !== undefined && ctx.focusedView.current !== props.node.id) {
            ctx.form.blur(ctx.focusedView.current);
          }
          ctx.form.focus(props.node.id);
          ctx.focusedView.current = props.node.id;
        },
        blur() {
          ctx.form.touch(instancePath.value);
          ctx.form.blur(props.node.id);
          if (ctx.focusedView.current === props.node.id) {
            ctx.focusedView.current = undefined;
          }
        },
      };
      const input: WidgetRenderInput = {
        field,
        view: props.node,
        scope: ctx.scope,
        value: fieldSnapshot.value.value,
        fieldSnapshot: fieldSnapshot.value,
        viewSnapshot: viewSnapshot.value,
        presentableErrors: presentableErrors.value,
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
            viewId: props.node.id,
            modelPath: field.path,
          },
          ctx.reportDiagnostic,
        );
      }
      const widgetInput: WidgetRenderInput = { ...input, nativeProps };
      return wrapAdapterCall(
        () => binding.render(widgetInput),
        {
          adapterId: ctx.adapter.id,
          key: field.widget,
          viewId: props.node.id,
          modelPath: field.path,
        },
        ctx.reportDiagnostic,
      );
    };
  },
});

viewRenderers.field = FieldRenderer;
