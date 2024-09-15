import type { ObjectView } from "@form/core";
import { defineComponent, Fragment, h, type PropType, type VNode } from "vue";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import { provideChildScope, useRendererContext } from "../context/renderer-context.js";
import { useViewSnapshot } from "../composables/snapshots.js";
import { ViewRenderer } from "./ViewRenderer.js";
import { viewRenderers } from "./registry.js";

export const ObjectRenderer = defineComponent({
  name: "ObjectRenderer",
  props: {
    node: { type: Object as PropType<ObjectView>, required: true },
  },
  setup(props) {
    const parent = useRendererContext();
    const childScope = parent.scope.scope(props.node.path);
    provideChildScope(childScope);
    const viewSnapshot = useViewSnapshot(() => props.node.id);
    return (): VNode | null => {
      if (!viewSnapshot.value.active || !viewSnapshot.value.visible) {
        return null;
      }
      const children = props.node.children.map((child) => h(ViewRenderer, { node: child, key: child.id }));
      const binding = parent.adapter.layouts.get("object");
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
        { adapterId: parent.adapter.id, key: "object", viewId: props.node.id, modelPath: props.node.path },
        parent.reportDiagnostic,
      );
    };
  },
});

viewRenderers.object = ObjectRenderer;
