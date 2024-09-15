import type { ArrayItemId } from "../../model/identity/index.js";
import type { RuntimeNodeId } from "../form/runtime-node-id.js";

export interface ArrayRecord {
  readonly order: ArrayItemId[];
}

export class ArrayStateStore {
  readonly nonce: string;
  nextSeq: number;
  readonly arrays = new Map<RuntimeNodeId, ArrayRecord>();
  readonly itemOwner = new Map<ArrayItemId, RuntimeNodeId>();

  constructor(nonce: string, nextSeq = 1) {
    this.nonce = nonce;
    this.nextSeq = nextSeq;
  }

  clone(): ArrayStateStore {
    const copy = new ArrayStateStore(this.nonce, this.nextSeq);
    for (const [id, record] of this.arrays) {
      copy.arrays.set(id, { order: [...record.order] });
    }
    for (const [item, owner] of this.itemOwner) {
      copy.itemOwner.set(item, owner);
    }
    return copy;
  }

  allocate(): ArrayItemId {
    const id = `${this.nonce}:${this.nextSeq}` as ArrayItemId;
    this.nextSeq += 1;
    return id;
  }

  setOrder(arrayId: RuntimeNodeId, order: readonly ArrayItemId[]): void {
    const previous = this.arrays.get(arrayId);
    if (previous !== undefined) {
      for (const item of previous.order) {
        this.itemOwner.delete(item);
      }
    }
    const next = [...order];
    this.arrays.set(arrayId, { order: next });
    for (const item of next) {
      this.itemOwner.set(item, arrayId);
    }
  }

  removeArray(arrayId: RuntimeNodeId): void {
    const previous = this.arrays.get(arrayId);
    if (previous !== undefined) {
      for (const item of previous.order) {
        this.itemOwner.delete(item);
      }
    }
    this.arrays.delete(arrayId);
  }
}
