import type { LayoutView } from "@form/core";
import type { ReactNode } from "react";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import { useRendererContext } from "../context/renderer-context.js";
import { useViewSnapshot } from "../hooks/snapshots.js";
import { ViewRenderer } from "./ViewRenderer.js";

export function LayoutRenderer({ node }: { readonly node: LayoutView }): ReactNode {
  const parent = useRendererContext();
  const viewSnapshot = useViewSnapshot(node.id);
  if (!viewSnapshot.active || !viewSnapshot.visible) {
    return null;
  }
  const children = node.children.map((child) => <ViewRenderer key={child.id} node={child} />);
  const binding = parent.adapter.layouts.get("layout");
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
          setActiveTab: (tabKey) => parent.form.setActiveTab(node.id, tabKey),
        },
        reportDiagnostic: parent.reportDiagnostic,
      }),
    { adapterId: parent.adapter.id, key: "layout", viewId: node.id },
    parent.reportDiagnostic,
  );
}
