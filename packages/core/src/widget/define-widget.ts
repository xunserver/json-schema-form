import type { WidgetDefinition } from "./widget.js";

type ExactKeys<T, Allowed> = {
  [K in Exclude<keyof T, keyof Allowed>]: never;
};

/** 声明逻辑 Widget（名字 + valueContract + interaction）。不要放入 Vue/React 组件。 */
export function defineWidget<const T extends WidgetDefinition>(
  definition: T & ExactKeys<T, WidgetDefinition>,
): T {
  return definition;
}
