import type { ViewNodeId } from "../../model/identity/index.js";
import type { ArrayItemId } from "../../model/identity/index.js";
import type { InstancePath, InstancePathLike } from "../../model/path/types.js";
import type { ArrayItemRef, JsonValue } from "../form/contracts.js";
import type { ArrayStateStore } from "../array/array-store.js";
import type { BindingIndex } from "../dependency/binding-index.js";

export type RuntimeCommand =
  | { readonly type: "setValue"; readonly path: InstancePathLike; readonly value: unknown }
  | { readonly type: "setValues"; readonly value: unknown }
  | { readonly type: "touch"; readonly path: InstancePathLike }
  | { readonly type: "focus"; readonly viewId: ViewNodeId; readonly scopeRuntimeId?: import("../form/runtime-node-id.js").RuntimeNodeId }
  | { readonly type: "blur"; readonly viewId: ViewNodeId; readonly scopeRuntimeId?: import("../form/runtime-node-id.js").RuntimeNodeId }
  | {
      readonly type: "setCollapsed";
      readonly viewId: ViewNodeId;
      readonly collapsed: boolean;
      readonly scopeRuntimeId?: import("../form/runtime-node-id.js").RuntimeNodeId;
    }
  | {
      readonly type: "setActiveTab";
      readonly viewId: ViewNodeId;
      readonly tabKey: string | null;
      readonly scopeRuntimeId?: import("../form/runtime-node-id.js").RuntimeNodeId;
    }
  | { readonly type: "reset" }
  | { readonly type: "arrayAppend"; readonly path: InstancePathLike; readonly value: unknown }
  | {
      readonly type: "arrayInsert";
      readonly path: InstancePathLike;
      readonly index: number;
      readonly value: unknown;
    }
  | { readonly type: "arrayRemove"; readonly path: InstancePathLike; readonly item: ArrayItemRef }
  | { readonly type: "arrayMove"; readonly path: InstancePathLike; readonly from: ArrayItemRef; readonly to: number }
  | {
      readonly type: "arraySetItem";
      readonly path: InstancePathLike;
      readonly item: ArrayItemRef;
      readonly value: unknown;
    }
  | {
      readonly type: "arrayReplaceItem";
      readonly path: InstancePathLike;
      readonly item: ArrayItemRef;
      readonly value: unknown;
    }
  | { readonly type: "arrayClear"; readonly path: InstancePathLike };

export type RuntimeCommandResult = ArrayItemId | undefined;

export class ChangeQueue {
  private readonly items: RuntimeCommand[] = [];

  enqueue(command: RuntimeCommand): void {
    this.items.push(command);
  }

  dequeue(): RuntimeCommand | undefined {
    return this.items.shift();
  }

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items.length = 0;
  }
}

export interface BlurredInteraction {
  readonly viewId: ViewNodeId;
  readonly path: InstancePath;
  readonly itemChain: readonly ArrayItemId[];
}

export interface TransactionDraft {
  values: JsonValue;
  readonly touched: Map<string, true>;
  readonly focused: Map<string, true>;
  readonly collapsed: Map<string, true>;
  readonly activeTab: Map<string, string>;
  readonly viewOwners: Map<string, import("../form/runtime-node-id.js").RuntimeNodeId>;
  readonly blurred: BlurredInteraction[];
  reset: boolean;
  valuesChanged: boolean;
  touchChanged: boolean;
  focusChanged: boolean;
  collapsedChanged: boolean;
  activeTabChanged: boolean;
  identityChanged: boolean;
  result?: ArrayItemId;
  arrays: ArrayStateStore;
  bindings: BindingIndex;
  orderOnlyArrayPaths: Set<string>;
  affectedEntityValues: Set<string>;
  affectedAddresses: Set<string>;
  affectedArrayOrders: Set<string>;
  abortEffects: Array<() => void>;
  generationInvalidations: string[];
  removedRuntimeIds: import("../form/runtime-node-id.js").RuntimeNodeId[];
}
