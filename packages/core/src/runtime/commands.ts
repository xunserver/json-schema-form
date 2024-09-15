import type { ViewNodeId } from "../identity/index.js";
import type { ArrayItemId } from "../identity/index.js";
import type { InstancePath, InstancePathLike } from "../path/types.js";
import type { ArrayItemRef, JsonValue } from "./contracts.js";
import type { ArrayStateStore } from "./array-store.js";
import type { BindingIndex } from "./binding-index.js";

export type RuntimeCommand =
  | { readonly type: "setValue"; readonly path: InstancePathLike; readonly value: unknown }
  | { readonly type: "setValues"; readonly value: unknown }
  | { readonly type: "touch"; readonly path: InstancePathLike }
  | { readonly type: "focus"; readonly viewId: ViewNodeId }
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

export interface TransactionDraft {
  values: JsonValue;
  readonly touched: Map<string, true>;
  readonly focused: Map<string, true>;
  reset: boolean;
  valuesChanged: boolean;
  touchChanged: boolean;
  focusChanged: boolean;
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
  removedRuntimeIds: import("./runtime-node-id.js").RuntimeNodeId[];
}
