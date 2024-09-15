import type { LayoutView } from "@form/core";
import { defineComponent, Fragment, h, type PropType, type VNode } from "vue";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import { useRendererContext } from "../context/renderer-context.js";
import { useViewSnapshot } from "../composables/snapshots.js";
import { ViewRenderer } from "./ViewRenderer.js";
import { viewRenderers } from "./registry.js";

export const LayoutRenderer = defineComponent({
  name: "LayoutRenderer",
  props: {
    node: { type: Object as PropType<LayoutView>, required: true },
  },
  setup(props) {
    const parent = useRendererContext();
    const viewSnapshot = useViewSnapshot(() => props.node.id);
    return (): VNode | null => {
      if (!viewSnapshot.value.active || !viewSnapshot.value.visible) {
        return null;
      }
      const children = props.node.children.map((child) => h(ViewRenderer, { node: child, key: child.id }));
      const binding = parent.adapter.layouts.get("layout");
      if (binding === undefined) {
        return h(Fragment, children);
      }
      return wrapAdapterCall(
        () =>
          binding.render({
            view: props.node,
            viewSnapshot: viewSnapshot.value,
            children,
            actions: {
              setCollapsed: (collapsed) => parent.form.setCollapsed(props.node.id, collapsed),
              setActiveTab: (tabKey) => parent.form.setActiveTab(props.node.id, tabKey),
            },
            reportDiagnostic: parent.reportDiagnostic,
          }),
        { adapterId: parent.adapter.id, key: "layout", viewId: props.node.id },
        parent.reportDiagnostic,
      );
    };
  },
});

viewRenderers.layout = LayoutRenderer;
