import type { DataNode } from "../model/data.js";
import type { ArrayItemId } from "../identity/index.js";
import type { InstancePath, ModelPath } from "../path/types.js";
import type { RuntimeNodeId } from "./runtime-node-id.js";

export interface BindingRecord {
  readonly runtimeId: RuntimeNodeId;
  readonly node: DataNode;
  readonly modelPath: ModelPath;
  readonly parent: RuntimeNodeId | undefined;
  readonly itemId: ArrayItemId | undefined;
}

export class BindingIndex {
  readonly pathToId = new Map<string, RuntimeNodeId>();
  readonly idToPath = new Map<RuntimeNodeId, InstancePath>();
  readonly records = new Map<RuntimeNodeId, BindingRecord>();
  readonly children = new Map<RuntimeNodeId, RuntimeNodeId[]>();

  clone(): BindingIndex {
    const copy = new BindingIndex();
    for (const [path, id] of this.pathToId) {
      copy.pathToId.set(path, id);
    }
    for (const [id, path] of this.idToPath) {
      copy.idToPath.set(id, path);
    }
    for (const [id, record] of this.records) {
      copy.records.set(id, record);
    }
    for (const [id, kids] of this.children) {
      copy.children.set(id, [...kids]);
    }
    return copy;
  }

  pathOf(id: RuntimeNodeId): InstancePath | undefined {
    return this.idToPath.get(id);
  }

  idAt(path: string): RuntimeNodeId | undefined {
    return this.pathToId.get(path);
  }

  set(record: BindingRecord, path: InstancePath): void {
    const previousPath = this.idToPath.get(record.runtimeId);
    if (previousPath !== undefined) {
      this.pathToId.delete(previousPath);
    }
    this.records.set(record.runtimeId, record);
    this.pathToId.set(path, record.runtimeId);
    this.idToPath.set(record.runtimeId, path);
    if (record.parent !== undefined) {
      const siblings = this.children.get(record.parent) ?? [];
      if (!siblings.includes(record.runtimeId)) {
        siblings.push(record.runtimeId);
        this.children.set(record.parent, siblings);
      }
    }
  }

  readdress(id: RuntimeNodeId, path: InstancePath): void {
    const previous = this.idToPath.get(id);
    if (previous !== undefined) {
      this.pathToId.delete(previous);
    }
    this.pathToId.set(path, id);
    this.idToPath.set(id, path);
  }

  descendants(root: RuntimeNodeId): RuntimeNodeId[] {
    const result: RuntimeNodeId[] = [];
    const stack = [...(this.children.get(root) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) {
        continue;
      }
      result.push(current);
      const kids = this.children.get(current);
      if (kids !== undefined) {
        stack.push(...kids);
      }
    }
    return result;
  }

  removeTree(root: RuntimeNodeId): RuntimeNodeId[] {
    const removed = [root, ...this.descendants(root)];
    for (const id of removed) {
      const path = this.idToPath.get(id);
      if (path !== undefined) {
        this.pathToId.delete(path);
        this.idToPath.delete(id);
      }
      const record = this.records.get(id);
      if (record?.parent !== undefined) {
        const siblings = this.children.get(record.parent);
        if (siblings !== undefined) {
          this.children.set(
            record.parent,
            siblings.filter((item) => item !== id),
          );
        }
      }
      this.records.delete(id);
      this.children.delete(id);
    }
    return removed;
  }
}
