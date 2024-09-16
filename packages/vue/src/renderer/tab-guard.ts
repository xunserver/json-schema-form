import type { LayoutBinding } from "../adapter/types.js";
import { RENDERER_DIAGNOSTIC_CODES } from "../adapter/diagnostic-codes.js";
import { freezeAdapterDiagnostic } from "../adapter/errors.js";
import type { ViewNodeId } from "@form/core";

export interface TabGuardContext {
  readonly adapterId: string;
  readonly layoutKey: string;
  readonly viewId: ViewNodeId;
  readonly tabs: LayoutBinding["tabs"];
  readonly setActiveTab: (tabKey: string | null) => void;
  readonly reportDiagnostic: (diagnostic: ReturnType<typeof freezeAdapterDiagnostic>) => void;
}

export function createGuardedSetActiveTab(context: TabGuardContext): (tabKey: string | null) => void {
  return (tabKey) => {
    if (context.tabs !== undefined && tabKey !== null && !context.tabs.includes(tabKey)) {
      context.reportDiagnostic(
        freezeAdapterDiagnostic({
          code: RENDERER_DIAGNOSTIC_CODES.INVALID_TAB,
          severity: "error",
          message: `Tab key "${tabKey}" is not declared for ${context.layoutKey} "${context.viewId}"`,
          source: "adapter",
          pluginId: context.adapterId,
          metadata: {
            adapterId: context.adapterId,
            key: context.layoutKey,
            viewId: context.viewId,
            tabKey,
          },
        }),
      );
      return;
    }
    context.setActiveTab(tabKey);
  };
}
