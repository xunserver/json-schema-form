import type { VueRegistry, VueRegistryEntryInspection, VueRegistryKind } from "./types.js";

export function createVueRegistry<T>(
  adapterId: string,
  registry: VueRegistryKind,
  entries: readonly VueRegistryEntryInspection<T>[],
): VueRegistry<T> {
  const list: readonly VueRegistryEntryInspection<T>[] = Object.freeze(
    entries.map((entry) =>
      Object.freeze({
        key: entry.key,
        owner: entry.owner,
        adapterId,
        registry,
        value: entry.value,
      }),
    ),
  );
  const byKey = new Map(list.map((entry) => [entry.key, entry]));

  const facade: VueRegistry<T> = {
    get size() {
      return list.length;
    },
    has(key) {
      return byKey.has(key);
    },
    get(key) {
      return byKey.get(key)?.value;
    },
    *keys() {
      for (const entry of list) {
        yield entry.key;
      }
    },
    *values() {
      for (const entry of list) {
        yield entry.value;
      }
    },
    *entries() {
      for (const entry of list) {
        yield [entry.key, entry.value];
      }
    },
    inspect(key) {
      return byKey.get(key);
    },
    inspectAll() {
      return list;
    },
    *[Symbol.iterator]() {
      for (const entry of list) {
        yield [entry.key, entry.value];
      }
    },
  };

  return Object.freeze(facade);
}
