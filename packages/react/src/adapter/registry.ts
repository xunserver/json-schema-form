import type { ReactRegistry, ReactRegistryEntryInspection, ReactRegistryKind } from "./types.js";

export function createReactRegistry<T>(
  adapterId: string,
  registry: ReactRegistryKind,
  entries: readonly ReactRegistryEntryInspection<T>[],
): ReactRegistry<T> {
  const list: readonly ReactRegistryEntryInspection<T>[] = Object.freeze(
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

  const facade: ReactRegistry<T> = {
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
