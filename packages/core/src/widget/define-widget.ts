import type { WidgetDefinition } from "./widget.js";

type ExactKeys<T, Allowed> = {
  [K in Exclude<keyof T, keyof Allowed>]: never;
};

export function defineWidget<const T extends WidgetDefinition>(
  definition: T & ExactKeys<T, WidgetDefinition>,
): T {
  return definition;
}
