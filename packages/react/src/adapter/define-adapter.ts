import type { ReactUIAdapter } from "./types.js";

type ExactKeys<T, Allowed> = {
  [K in Exclude<keyof T, keyof Allowed>]: never;
};

/** 规范化 React UI Adapter 描述，不安装全局 Registry。 */
export function defineReactUIAdapter<const T extends ReactUIAdapter>(
  adapter: T & ExactKeys<T, ReactUIAdapter>,
): T {
  return adapter;
}
