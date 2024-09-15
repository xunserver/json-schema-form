import { expect } from "vitest";
import { EnvironmentBuildError } from "./environment-build-error.js";
import { definePlugin } from "./plugin.js";
import type { FormPlugin } from "./plugin.js";
import type { WidgetDefinition } from "./widget.js";
import { FULL_WIDGET_INTERACTION } from "./widget.js";

export function sampleWidget(name: string): WidgetDefinition {
  return {
    name,
    valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
    interaction: FULL_WIDGET_INTERACTION,
  };
}

export function widgetPlugin(id: string, key: string, extra: Partial<FormPlugin> = {}): FormPlugin {
  return definePlugin({
    id,
    ...(extra.protocol === undefined ? {} : { protocol: extra.protocol }),
    ...(extra.dependsOn === undefined ? {} : { dependsOn: extra.dependsOn }),
    contributes: extra.contributes ?? {
      widgets: {
        [key]: sampleWidget(key),
      },
    },
  });
}

export function expectBuildError(run: () => unknown): EnvironmentBuildError {
  try {
    const result = run();
    throw new Error(`Expected EnvironmentBuildError but received ${String(result)}`);
  } catch (error) {
    if (error instanceof EnvironmentBuildError) {
      expect("environment" in error).toBe(false);
      return error;
    }
    throw error;
  }
}

export function codesOf(error: EnvironmentBuildError): string[] {
  return error.diagnostics.map((diagnostic) => diagnostic.code);
}
