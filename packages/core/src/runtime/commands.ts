import type { ViewNodeId } from "../identity/index.js";
import type { InstancePath, InstancePathLike } from "../path/types.js";
import type { JsonValue } from "./contracts.js";

export type RuntimeCommand =
  | { readonly type: "setValue"; readonly path: InstancePathLike; readonly value: unknown }
  | { readonly type: "setValues"; readonly value: unknown }
  | { readonly type: "touch"; readonly path: InstancePathLike }
  | { readonly type: "focus"; readonly viewId: ViewNodeId }
  | { readonly type: "reset" };

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
}
