import type { VueUIAdapter } from "./types.js";

type ExactKeys<T, Allowed> = {
  [K in Exclude<keyof T, keyof Allowed>]: never;
};

/** 规范化 Vue UI Adapter 描述，不安装全局 Registry。 */
export function defineVueUIAdapter<const T extends VueUIAdapter>(
  adapter: T & ExactKeys<T, VueUIAdapter>,
): T {
  return adapter;
}
