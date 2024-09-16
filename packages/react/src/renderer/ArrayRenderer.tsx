import type { ArrayView, DataNode, ViewNode } from "@xunserver-jsf/core";
import type { RenderScope } from "@xunserver-jsf/core/runtime";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { wrapAdapterCall } from "../adapter/runtime-error.js";
import { RendererScopeProvider, useRendererContext } from "../context/renderer-context.js";
import { useArrayOrder, useViewSnapshot } from "../hooks/snapshots.js";
import { createGuardedSetActiveTab } from "./tab-guard.js";
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
  const dataNode = parent.form.model.data.nodes.get(node.path);
  const itemNodes = order.flatMap((itemId, index) => {
    const layouts = itemLayoutsAtIndex(node, dataNode, index);
    if (layouts.length === 0) {
      return [];
    }
    const itemScope = arrayScope.item(itemId, node.path);
    return [<ArrayItemScope key={itemId} scope={itemScope} layouts={layouts} />];
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
                setActiveTab: createGuardedSetActiveTab({
                  adapterId: parent.adapter.id,
                  layoutKey: "array",
                  viewId: node.id,
                  tabs: binding.tabs,
                  setActiveTab: (tabKey) => parent.form.setActiveTab(node.id, tabKey),
                  reportDiagnostic: parent.reportDiagnostic,
                }),
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
  layouts,
}: {
  readonly scope: RenderScope;
  readonly layouts: readonly ViewNode[];
}): ReactNode {
  return (
    <RendererScopeProvider scope={scope}>
      {layouts.map((child) => (
        <ViewRenderer key={child.id} node={child} />
      ))}
    </RendererScopeProvider>
  );
}

function itemLayoutsAtIndex(
  view: ArrayView,
  dataNode: DataNode | undefined,
  index: number,
): readonly ViewNode[] {
  if (dataNode === undefined || dataNode.kind !== "array") {
    return view.itemLayout;
  }
  const prefixCount = dataNode.prefixItems?.length ?? 0;
  if (prefixCount === 0) {
    return view.itemLayout;
  }
  if (index < prefixCount) {
    const slot = view.itemLayout[index];
    return slot === undefined ? [] : [slot];
  }
  if (dataNode.items === undefined) {
    return [];
  }
  return view.itemLayout.slice(prefixCount);
}
