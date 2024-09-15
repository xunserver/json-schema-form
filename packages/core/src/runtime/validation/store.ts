import type { ValidationError } from "../../validation/error.js";
import type { RuntimeNodeId } from "../form/runtime-node-id.js";
import { EMPTY_ERRORS, sortErrors } from "./errors.js";

export interface OwnerEntry {
  readonly runtimeId: RuntimeNodeId;
  readonly error: ValidationError;
}

export interface OwnerRecord {
  readonly key: string;
  readonly source: ValidationError["source"];
  readonly preserveOnChange: boolean;
  readonly entries: readonly OwnerEntry[];
}

export class ErrorStore {
  readonly owners = new Map<string, OwnerRecord>();
  readonly direct = new Map<RuntimeNodeId, ValidationError[]>();
  revision = 1;
  private dataOrder = new Map<string, number>();
  private planOrder = new Map<string, number>();
  private dirty = new Set<RuntimeNodeId>();

  setOrder(dataOrder: ReadonlyMap<string, number>, planOrder: ReadonlyMap<string, number>): void {
    this.dataOrder = new Map(dataOrder);
    this.planOrder = new Map(planOrder);
  }

  takeDirty(): Set<RuntimeNodeId> {
    const dirty = this.dirty;
    this.dirty = new Set();
    return dirty;
  }

  replaceOwner(record: OwnerRecord): boolean {
    const previous = this.owners.get(record.key);
    const entries = Object.freeze(
      record.entries.map((entry) => {
        const prior = previous?.entries.find(
          (item) =>
            item.runtimeId === entry.runtimeId &&
            item.error.id === entry.error.id &&
            item.error.message === entry.error.message,
        );
        return Object.freeze({
          runtimeId: entry.runtimeId,
          error: prior?.error ?? entry.error,
        });
      }),
    );
    if (previous !== undefined && equivalent(previous, { ...record, entries }) && previous.preserveOnChange === record.preserveOnChange) {
      return false;
    }
    this.owners.set(
      record.key,
      Object.freeze({
        key: record.key,
        source: record.source,
        preserveOnChange: record.preserveOnChange,
        entries,
      }),
    );
    this.rebuildDirect();
    this.revision += 1;
    return true;
  }

  removeOwner(key: string): boolean {
    if (!this.owners.delete(key)) {
      return false;
    }
    this.rebuildDirect();
    this.revision += 1;
    return true;
  }

  removeWhere(match: (record: OwnerRecord) => boolean): boolean {
    const keys = [...this.owners.values()].filter(match).map((record) => record.key);
    if (keys.length === 0) {
      return false;
    }
    for (const key of keys) {
      this.owners.delete(key);
    }
    this.rebuildDirect();
    this.revision += 1;
    return true;
  }

  clear(): boolean {
    if (this.owners.size === 0) {
      return false;
    }
    for (const id of this.direct.keys()) {
      this.dirty.add(id);
    }
    this.owners.clear();
    this.direct.clear();
    this.revision += 1;
    return true;
  }

  directErrors(id: RuntimeNodeId | undefined): readonly ValidationError[] {
    if (id === undefined) {
      return EMPTY_ERRORS;
    }
    const list = this.direct.get(id);
    return list === undefined ? EMPTY_ERRORS : list;
  }

  allErrors(): readonly ValidationError[] {
    const errors: ValidationError[] = [];
    for (const list of this.direct.values()) {
      errors.push(...list);
    }
    return Object.freeze(sortErrors(errors, this.dataOrder, this.planOrder));
  }

  private rebuildDirect(): void {
    const previous = new Map(this.direct);
    this.direct.clear();
    for (const owner of this.owners.values()) {
      for (const entry of owner.entries) {
        const list = this.direct.get(entry.runtimeId) ?? [];
        list.push(entry.error);
        this.direct.set(entry.runtimeId, list);
      }
    }
    for (const [id, list] of this.direct) {
      this.direct.set(id, sortErrors(list, this.dataOrder, this.planOrder));
    }
    const ids = new Set([...previous.keys(), ...this.direct.keys()]);
    for (const id of ids) {
      if (!sameErrorList(previous.get(id), this.direct.get(id))) {
        this.dirty.add(id);
      }
    }
  }
}

function equivalent(left: OwnerRecord, right: OwnerRecord): boolean {
  if (left.entries.length !== right.entries.length) {
    return false;
  }
  for (let index = 0; index < left.entries.length; index += 1) {
    const a = left.entries[index]!;
    const b = right.entries[index]!;
    if (a.runtimeId !== b.runtimeId || a.error.id !== b.error.id || a.error.message !== b.error.message) {
      return false;
    }
  }
  return true;
}

function sameErrorList(left: ValidationError[] | undefined, right: ValidationError[] | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined || left.length !== right.length) {
    return false;
  }
  return left.every((error, index) => error === right[index] || error.id === right[index]?.id);
}
