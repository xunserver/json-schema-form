declare const runtimeNodeIdBrand: unique symbol;

export type RuntimeNodeId = string & {
  readonly [runtimeNodeIdBrand]: "RuntimeNodeId";
};

export class RuntimeNodeInterner {
  private readonly interned = new Map<string, RuntimeNodeId>();
  private next = 0;

  intern(parts: readonly string[]): RuntimeNodeId {
    const key = parts.join("\0");
    const existing = this.interned.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const id = `rn:${this.next}` as RuntimeNodeId;
    this.next += 1;
    this.interned.set(key, id);
    return id;
  }
}
