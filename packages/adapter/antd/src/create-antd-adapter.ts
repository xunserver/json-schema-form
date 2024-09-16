import {
  defineReactUIAdapter,
  type ReactAdapterContribution,
  type ReactUIAdapter,
  type WidgetBinding,
  type LayoutBinding,
} from "@form/react";
import { antdFieldChrome } from "./field-chrome/field-chrome.js";
import { antdFormAdapter } from "./form/form-adapter.js";
import { layoutBindings } from "./layouts/layouts.js";
import { widgetBindings } from "./widgets/bindings.js";

export const ANTD_ADAPTER_ID = "antd";

export function createAntdAdapter(options?: {
  readonly widgets?: Readonly<Record<string, WidgetBinding>>;
  readonly layouts?: Readonly<Record<string, LayoutBinding>>;
}): ReactUIAdapter {
  return defineReactUIAdapter({
    id: ANTD_ADAPTER_ID,
    protocol: { min: { major: 1, minor: 0 } },
    form: antdFormAdapter,
    fieldChrome: antdFieldChrome,
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

export const antdAdapter: ReactUIAdapter = Object.freeze(createAntdAdapter());

export function extendAntdAdapter(options: {
  readonly owner: string;
  readonly widgets?: Readonly<Record<string, WidgetBinding>>;
  readonly layouts?: Readonly<Record<string, LayoutBinding>>;
}): ReactAdapterContribution {
  return Object.freeze({
    owner: options.owner,
    adapterId: ANTD_ADAPTER_ID,
    ...(options.widgets === undefined ? {} : { widgets: options.widgets }),
    ...(options.layouts === undefined ? {} : { layouts: options.layouts }),
  });
}
