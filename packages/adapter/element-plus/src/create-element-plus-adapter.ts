import { defineVueUIAdapter, type VueAdapterContribution, type VueUIAdapter, type WidgetBinding, type LayoutBinding } from "@xunserver-jsf/vue";
import { elementPlusFieldChrome } from "./field-chrome/field-chrome.js";
import { elementPlusFormAdapter } from "./form/form-adapter.js";
import { layoutBindings } from "./layouts/layouts.js";
import { widgetBindings } from "./widgets/bindings.js";

export const ELEMENT_PLUS_ADAPTER_ID = "element-plus";

/**
 * 创建 Element Plus Adapter。`widgets` / `layouts` 只追加新 key，不会覆盖内置 binding。
 */
export function createElementPlusAdapter(options?: {
  readonly widgets?: Readonly<Record<string, WidgetBinding>>;
  readonly layouts?: Readonly<Record<string, LayoutBinding>>;
}): VueUIAdapter {
  return defineVueUIAdapter({
    id: ELEMENT_PLUS_ADAPTER_ID,
    protocol: { min: { major: 1, minor: 0 } },
    form: elementPlusFormAdapter,
    fieldChrome: elementPlusFieldChrome,
    widgets: mergeExclusive(widgetBindings, options?.widgets),
    layouts: mergeExclusive(layoutBindings, options?.layouts),
  });
}

function mergeExclusive<T>(
  base: Readonly<Record<string, T>>,
  extra: Readonly<Record<string, T>> | undefined,
): Readonly<Record<string, T>> {
  if (extra === undefined) {
    return base;
  }
  const merged: Record<string, T> = { ...base };
  for (const key of Object.keys(extra)) {
    if (Object.prototype.hasOwnProperty.call(merged, key)) {
      continue;
    }
    merged[key] = extra[key]!;
  }
  return merged;
}

export const elementPlusAdapter: VueUIAdapter = Object.freeze(createElementPlusAdapter());

export function extendElementPlusAdapter(options: {
  readonly owner: string;
  readonly widgets?: Readonly<Record<string, WidgetBinding>>;
  readonly layouts?: Readonly<Record<string, LayoutBinding>>;
}): VueAdapterContribution {
  return Object.freeze({
    owner: options.owner,
    adapterId: ELEMENT_PLUS_ADAPTER_ID,
    ...(options.widgets === undefined ? {} : { widgets: options.widgets }),
    ...(options.layouts === undefined ? {} : { layouts: options.layouts }),
  });
}
