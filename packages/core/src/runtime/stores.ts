import type { JsonValue } from "./contracts.js";

export class ValueStoreImpl {
  initial: JsonValue;
  current: JsonValue;
  revision = 1;

  constructor(initial: JsonValue) {
    this.initial = initial;
    this.current = initial;
  }
}

export class NodeStateStore {
  readonly entries = new Map<string, Record<string, never>>();
  revision = 1;
}

export class FieldStateStore {
  readonly touched = new Map<string, true>();
  revision = 1;
}

export class ViewStateStore {
  readonly focused = new Map<string, true>();
  readonly collapsed = new Map<string, true>();
  readonly activeTab = new Map<string, string>();
  readonly owners = new Map<string, string>();
  revision = 1;
}

export class FormStateStore {
  version = 0;
  revision = 1;
}

export class EffectScheduler {
  schedule(work: () => void): void {
    work();
  }
}
