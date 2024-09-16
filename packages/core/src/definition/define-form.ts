import type { FormDefinition } from "./form-definition.js";

type ExactKeys<T, Allowed> = {
  [K in Exclude<keyof T, keyof Allowed>]: never;
};

/** 无副作用组装 `FormDefinition`。不编译、不创建 Runtime、不注册全局状态。 */
export function defineForm<const T extends FormDefinition>(
  definition: T & ExactKeys<T, FormDefinition>,
): T {
  return definition;
}
