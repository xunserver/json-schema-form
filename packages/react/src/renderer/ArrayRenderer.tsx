import type { ArrayView } from "@form/core";
import type { RenderScope } from "@form/core/runtime";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import { RendererScopeProvider, useRendererContext } from "../context/renderer-context.js";
import { useArrayOrder, useViewSnapshot } from "../hooks/snapshots.js";
import { ViewRenderer } from "./ViewRenderer.js";

export function ArrayRenderer({ node }: { readonly node: ArrayView }): ReactNode {
  const parent = useRendererContext();
  const viewSnapshot = useViewSnapshot(node.id);
  const arrayScope = useMemo(() => {
    if (parent.scope.binding.stale || parent.scope.binding.modelPath === node.path) {
      return parent.scope;
    }
    try {
      return parent.scope.scope(node.path);
    } catch {
      return parent.scope;
    }
  }, [parent.scope, node.path]);
  const instancePath = useMemo(
    () => (parent.scope.binding.stale ? node.path : parent.scope.resolve(node.path)),
    [parent.scope, node.path],
  );
  const order = useArrayOrder(instancePath);
  if (parent.scope.binding.stale || !viewSnapshot.active || !viewSnapshot.visible) {
    return null;
  }
  const itemNodes = order.map((itemId) => {
    const itemScope = arrayScope.item(itemId, node.path);
    return <ArrayItemScope key={itemId} scope={itemScope} node={node} />;
  });
  const binding = parent.adapter.layouts.get("array");
  const content =
    binding === undefined
      ? itemNodes
      : wrapAdapterCall(
          () =>
            binding.render({
              view: node,
              viewSnapshot,
              children: itemNodes,
              actions: {
                setCollapsed: (collapsed) => parent.form.setCollapsed(node.id, collapsed),
                setActiveTab: (tabKey) => parent.form.setActiveTab(node.id, tabKey),
              },
              reportDiagnostic: parent.reportDiagnostic,
            }),
          { adapterId: parent.adapter.id, key: "array", viewId: node.id, modelPath: node.path },
          parent.reportDiagnostic,
        );
  return <RendererScopeProvider scope={arrayScope}>{content}</RendererScopeProvider>;
}

function ArrayItemScope({
  scope,
  node,
}: {
  readonly scope: RenderScope;
  readonly node: ArrayView;
}): ReactNode {
  return (
    <RendererScopeProvider scope={scope}>
      {node.itemLayout.map((child) => (
        <ViewRenderer key={child.id} node={child} />
      ))}
    </RendererScopeProvider>
  );
}
