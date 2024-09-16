import type { ArrayView } from "@xunserver-jsf/core";
import type { RenderScope } from "@xunserver-jsf/core/runtime";
import { defineComponent, Fragment, h, type PropType, type VNode } from "vue";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import { provideChildScope, provideRendererContext, useRendererContext } from "../context/renderer-context.js";
import { useArrayOrder, useViewSnapshot } from "../composables/snapshots.js";
import { createGuardedSetActiveTab } from "./tab-guard.js";
import { ViewRenderer } from "./ViewRenderer.js";
import { viewRenderers } from "./registry.js";

export const ArrayRenderer = defineComponent({
  name: "ArrayRenderer",
  props: {
    node: { type: Object as PropType<ArrayView>, required: true },
  },
  setup(props) {
    const parent = useRendererContext();
    const arrayScope = parent.scope.scope(props.node.path);
    provideChildScope(arrayScope);
    const viewSnapshot = useViewSnapshot(() => props.node.id);
    const order = useArrayOrder(() => parent.scope.resolve(props.node.path));
    return (): VNode | null => {
      if (!viewSnapshot.value.active || !viewSnapshot.value.visible) {
        return null;
      }
      const itemNodes = order.value.map((itemId) => {
        const itemScope = arrayScope.item(itemId, props.node.path);
        return h(ArrayItemScope, { key: itemId, scope: itemScope, node: props.node });
      });
      const binding = parent.adapter.layouts.get("array");
      if (binding === undefined) {
        return h(Fragment, itemNodes);
      }
      return wrapAdapterCall(
        () =>
          binding.render({
            view: props.node,
            viewSnapshot: viewSnapshot.value,
            children: itemNodes,
            actions: {
              setCollapsed: (collapsed) => parent.form.setCollapsed(props.node.id, collapsed),
              setActiveTab: createGuardedSetActiveTab({
                adapterId: parent.adapter.id,
                layoutKey: "array",
                viewId: props.node.id,
                tabs: binding.tabs,
                setActiveTab: (tabKey) => parent.form.setActiveTab(props.node.id, tabKey),
                reportDiagnostic: parent.reportDiagnostic,
              }),
            },
            reportDiagnostic: parent.reportDiagnostic,
          }),
        { adapterId: parent.adapter.id, key: "array", viewId: props.node.id, modelPath: props.node.path },
        parent.reportDiagnostic,
      );
    };
  },
});

const ArrayItemScope = defineComponent({
  name: "ArrayItemScope",
  props: {
    scope: { type: Object as PropType<RenderScope>, required: true },
    node: { type: Object as PropType<ArrayView>, required: true },
  },
  setup(props) {
    const parent = useRendererContext();
    provideRendererContext({
      form: parent.form,
      environment: parent.environment,
      adapter: parent.adapter,
      scope: props.scope,
      idPrefix: parent.idPrefix,
      reportDiagnostic: parent.reportDiagnostic,
      focusedView: parent.focusedView,
    });
    return (): VNode => h(
      Fragment,
      props.node.itemLayout.map((child) => h(ViewRenderer, { node: child, key: child.id })),
    );
  },
});

viewRenderers.array = ArrayRenderer;
