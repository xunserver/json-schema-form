import type { ReactUIAdapter } from "./types.js";

type ExactKeys<T, Allowed> = {
  [K in Exclude<keyof T, keyof Allowed>]: never;
};

export function defineReactUIAdapter<const T extends ReactUIAdapter>(
  adapter: T & ExactKeys<T, ReactUIAdapter>,
): T {
  return adapter;
}
