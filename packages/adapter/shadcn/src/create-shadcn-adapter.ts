import {
  defineReactUIAdapter,
  RendererAdapterError,
  RENDERER_DIAGNOSTIC_CODES,
  type ReactAdapterContribution,
  type ReactUIAdapter,
  type WidgetBinding,
  type LayoutBinding,
} from "@xunserver-jsf/react";
import {
  REQUIRED_SHADCN_SLOTS,
  type RequiredShadcnSlot,
  type ShadcnAdapterComponents,
} from "./components.js";
import { createShadcnFieldChrome } from "./field-chrome/field-chrome.js";
import { createShadcnFormAdapter } from "./form/form-adapter.js";
import { createLayoutBindings } from "./layouts/layouts.js";
import { createWidgetBindings } from "./widgets/bindings.js";

export const SHADCN_ADAPTER_ID = "shadcn";

export class ShadcnAdapterConfigurationError extends RendererAdapterError {
  constructor(missingSlots: readonly RequiredShadcnSlot[]) {
    super({
      code: RENDERER_DIAGNOSTIC_CODES.MISSING_CAPABILITY,
      severity: "error",
      message: `createShadcnAdapter requires components: missing ${missingSlots.join(", ")}`,
      source: "adapter",
      pluginId: SHADCN_ADAPTER_ID,
      metadata: {
        adapterId: SHADCN_ADAPTER_ID,
        missingSlots: [...missingSlots],
      },
    });
  }
}

function assertComponents(components: ShadcnAdapterComponents): void {
  const missing: RequiredShadcnSlot[] = [];
  for (const slot of REQUIRED_SHADCN_SLOTS) {
    if (components[slot] === undefined || components[slot] === null) {
      missing.push(slot);
    }
  }
  if (missing.length > 0) {
    throw new ShadcnAdapterConfigurationError(missing);
  }
}

/**
 * 创建 shadcn Adapter。必须注入 `components`；缺槽抛 `ShadcnAdapterConfigurationError`。
 * `widgets` / `layouts` 只追加新 key。
 */
export function createShadcnAdapter(options: {
  readonly components: ShadcnAdapterComponents;
  readonly widgets?: Readonly<Record<string, WidgetBinding>>;
  readonly layouts?: Readonly<Record<string, LayoutBinding>>;
}): ReactUIAdapter {
  assertComponents(options.components);
  const widgetBindings = createWidgetBindings(options.components);
  const layoutBindings = createLayoutBindings(options.components);
  return defineReactUIAdapter({
    id: SHADCN_ADAPTER_ID,
    protocol: { min: { major: 1, minor: 0 } },
    form: createShadcnFormAdapter(),
    fieldChrome: createShadcnFieldChrome(options.components),
    widgets: mergeExclusive(widgetBindings, options.widgets),
    layouts: mergeExclusive(layoutBindings, options.layouts),
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

export function extendShadcnAdapter(options: {
  readonly owner: string;
  readonly widgets?: Readonly<Record<string, WidgetBinding>>;
  readonly layouts?: Readonly<Record<string, LayoutBinding>>;
}): ReactAdapterContribution {
  return Object.freeze({
    owner: options.owner,
    adapterId: SHADCN_ADAPTER_ID,
    ...(options.widgets === undefined ? {} : { widgets: options.widgets }),
    ...(options.layouts === undefined ? {} : { layouts: options.layouts }),
  });
}
