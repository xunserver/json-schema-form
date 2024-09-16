import type { GroupView } from "@form/core";
import { defineComponent, Fragment, h, type PropType, type VNode } from "vue";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import { useRendererContext } from "../context/renderer-context.js";
import { useViewSnapshot } from "../composables/snapshots.js";
import { createGuardedSetActiveTab } from "./tab-guard.js";
import { ViewRenderer } from "./ViewRenderer.js";
import { viewRenderers } from "./registry.js";

export const GroupRenderer = defineComponent({
  name: "GroupRenderer",
  props: {
    node: { type: Object as PropType<GroupView>, required: true },
  },
  setup(props) {
    const parent = useRendererContext();
    const viewSnapshot = useViewSnapshot(() => props.node.id);
    return (): VNode | null => {
      if (!viewSnapshot.value.active || !viewSnapshot.value.visible) {
        return null;
      }
      const children = props.node.children.map((child) => h(ViewRenderer, { node: child, key: child.id }));
      const binding = parent.adapter.layouts.get("group");
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
              setActiveTab: createGuardedSetActiveTab({
                adapterId: parent.adapter.id,
                layoutKey: "group",
                viewId: props.node.id,
                tabs: binding.tabs,
                setActiveTab: (tabKey) => parent.form.setActiveTab(props.node.id, tabKey),
                reportDiagnostic: parent.reportDiagnostic,
              }),
            },
            reportDiagnostic: parent.reportDiagnostic,
          }),
        { adapterId: parent.adapter.id, key: "group", viewId: props.node.id },
        parent.reportDiagnostic,
      );
    };
  },
});

viewRenderers.group = GroupRenderer;
