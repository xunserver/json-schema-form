import type { ObjectView } from "@xunserver-jsf/core";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import { RendererScopeProvider, useRendererContext } from "../context/renderer-context.js";
import { useViewSnapshot } from "../hooks/snapshots.js";
import { createGuardedSetActiveTab } from "./tab-guard.js";
import { ViewRenderer } from "./ViewRenderer.js";

export function ObjectRenderer({ node }: { readonly node: ObjectView }): ReactNode {
  const parent = useRendererContext();
  const viewSnapshot = useViewSnapshot(node.id);
  const childScope = useMemo(() => {
    if (parent.scope.binding.stale || parent.scope.binding.modelPath === node.path) {
      return parent.scope;
    }
    try {
      return parent.scope.scope(node.path);
    } catch {
      return parent.scope;
    }
  }, [parent.scope, node.path]);
  if (parent.scope.binding.stale || !viewSnapshot.active || !viewSnapshot.visible) {
    return null;
  }
  const children = node.children.map((child) => <ViewRenderer key={child.id} node={child} />);
  const binding = parent.adapter.layouts.get("object");
  const content =
    binding === undefined
      ? children
      : wrapAdapterCall(
          () =>
            binding.render({
              view: node,
              viewSnapshot,
              children,
              actions: {
                setCollapsed: (collapsed) => parent.form.setCollapsed(node.id, collapsed),
                setActiveTab: createGuardedSetActiveTab({
                  adapterId: parent.adapter.id,
                  layoutKey: "object",
                  viewId: node.id,
                  tabs: binding.tabs,
                  setActiveTab: (tabKey) => parent.form.setActiveTab(node.id, tabKey),
                  reportDiagnostic: parent.reportDiagnostic,
                }),
              },
              reportDiagnostic: parent.reportDiagnostic,
            }),
          { adapterId: parent.adapter.id, key: "object", viewId: node.id, modelPath: node.path },
          parent.reportDiagnostic,
        );
  return <RendererScopeProvider scope={childScope}>{content}</RendererScopeProvider>;
}
