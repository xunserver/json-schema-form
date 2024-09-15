export interface ReadonlyKeyedCollection<K, V> {
  readonly size: number;
  has(key: K): boolean;
  get(key: K): V | undefined;
  keys(): IterableIterator<K>;
  values(): IterableIterator<V>;
  entries(): IterableIterator<readonly [K, V]>;
  forEach(callback: (value: V, key: K) => void): void;
  [Symbol.iterator](): IterableIterator<readonly [K, V]>;
}

export function createReadonlyKeyedCollection<K, V>(
  entries: readonly (readonly [K, V])[],
): ReadonlyKeyedCollection<K, V> {
  const keys: K[] = [];
  const values: V[] = [];
  const index = new Map<K, number>();

  for (const [key, value] of entries) {
    if (index.has(key)) {
      continue;
    }
    index.set(key, keys.length);
    keys.push(key);
    values.push(value);
  }

  Object.freeze(keys);
  Object.freeze(values);

  const collection: ReadonlyKeyedCollection<K, V> = {
    get size() {
      return keys.length;
    },
    has(key: K) {
      return index.has(key);
    },
    get(key: K) {
      const position = index.get(key);
      return position === undefined ? undefined : values[position];
    },
    *keys() {
      yield* keys;
    },
    *values() {
      yield* values;
    },
    *entries() {
      for (let position = 0; position < keys.length; position += 1) {
        yield [keys[position]!, values[position]!];
      }
    },
    forEach(callback: (value: V, key: K) => void) {
      for (let position = 0; position < keys.length; position += 1) {
        callback(values[position]!, keys[position]!);
      }
    },
    *[Symbol.iterator]() {
      yield* this.entries();
    },
  };

  return Object.freeze(collection);
}
