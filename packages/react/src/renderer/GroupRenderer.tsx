import type { GroupView } from "@form/core";
import type { ReactNode } from "react";
import { RENDERER_DIAGNOSTIC_CODES } from "../adapter/diagnostic-codes.js";
import { freezeAdapterDiagnostic } from "../adapter/errors.js";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import { useRendererContext } from "../context/renderer-context.js";
import { useViewSnapshot } from "../hooks/snapshots.js";
import { ViewRenderer } from "./ViewRenderer.js";

export function GroupRenderer({ node }: { readonly node: GroupView }): ReactNode {
  const parent = useRendererContext();
  const viewSnapshot = useViewSnapshot(node.id);
  if (!viewSnapshot.active || !viewSnapshot.visible) {
    return null;
  }
  const children = node.children.map((child) => <ViewRenderer key={child.id} node={child} />);
  const binding = parent.adapter.layouts.get("group");
  if (binding === undefined) {
    return children;
  }
  return wrapAdapterCall(
    () =>
      binding.render({
        view: node,
        viewSnapshot,
        children,
        actions: {
          setCollapsed: (collapsed) => parent.form.setCollapsed(node.id, collapsed),
          setActiveTab: (tabKey) => {
            if (binding.tabs !== undefined && tabKey !== null && !binding.tabs.includes(tabKey)) {
              parent.reportDiagnostic(
                freezeAdapterDiagnostic({
                  code: RENDERER_DIAGNOSTIC_CODES.INVALID_TAB,
                  severity: "error",
                  message: `Tab key "${tabKey}" is not declared for group "${node.id}"`,
                  source: "adapter",
                  pluginId: parent.adapter.id,
                  metadata: {
                    adapterId: parent.adapter.id,
                    key: "group",
                    viewId: node.id,
                    tabKey,
                  },
                }),
              );
              return;
            }
            parent.form.setActiveTab(node.id, tabKey);
          },
        },
        reportDiagnostic: parent.reportDiagnostic,
      }),
    { adapterId: parent.adapter.id, key: "group", viewId: node.id },
    parent.reportDiagnostic,
  );
}
