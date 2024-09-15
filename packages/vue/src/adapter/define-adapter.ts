import type { VueUIAdapter } from "./types.js";

type ExactKeys<T, Allowed> = {
  [K in Exclude<keyof T, keyof Allowed>]: never;
};

export function defineVueUIAdapter<const T extends VueUIAdapter>(
  adapter: T & ExactKeys<T, VueUIAdapter>,
): T {
  return adapter;
}
