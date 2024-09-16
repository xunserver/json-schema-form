import { describe, expect, test } from "vitest";
import { compileForm, defineForm } from "@xunserver-jsf/core";
import type { Diagnostic } from "@xunserver-jsf/core";
import {
  createFormEnvironment,
  definePlugin,
  defineWidget,
  FULL_WIDGET_INTERACTION,
} from "@xunserver-jsf/core/extension";
import type { WidgetDefinition, WidgetInteractionContract, WidgetSemanticAction } from "@xunserver-jsf/core/extension";

interface RecordingBinding {
  readonly widget: string;
  readonly actions: readonly WidgetSemanticAction[];
}

interface RecordingAdapter {
  readonly adapterId: string;
  readonly bindings: Readonly<Record<string, RecordingBinding>>;
  readonly writes: unknown[];
  readonly nativeEvents: unknown[];
}

function declaredActions(interaction: WidgetInteractionContract): readonly WidgetSemanticAction[] {
  const actions: WidgetSemanticAction[] = ["setValue"];
  if (interaction.touch === true) {
    actions.push("touch");
  }
  if (interaction.focus === true) {
    actions.push("focus");
  }
  if (interaction.blur === true) {
    actions.push("blur");
  }
  return actions;
}

function createRecordingAdapter(
  adapterId: string,
  bindings: Readonly<Record<string, RecordingBinding>>,
): RecordingAdapter {
  return { adapterId, bindings, writes: [], nativeEvents: [] };
}

function preflightAdapter(
  definition: WidgetDefinition,
  adapter: RecordingAdapter,
): Diagnostic[] {
  const binding = adapter.bindings[definition.name];
  const declared = declaredActions(definition.interaction);
  if (binding === undefined) {
    return [
      {
        code: "adapter.widget-missing",
        severity: "error",
        message: `Adapter "${adapter.adapterId}" has no binding for widget "${definition.name}"`,
        source: "adapter",
        pluginId: adapter.adapterId,
        metadata: { widget: definition.name, adapterId: adapter.adapterId },
      },
    ];
  }
  return declared
    .filter((action) => !binding.actions.includes(action))
    .map((action) => ({
      code: "adapter.widget-incompatible",
      severity: "error" as const,
      message: `Adapter "${adapter.adapterId}" cannot provide "${action}" for widget "${definition.name}"`,
      source: "adapter" as const,
      pluginId: adapter.adapterId,
      metadata: { widget: definition.name, action, adapterId: adapter.adapterId },
    }));
}

describe("framework-neutral Adapter interaction preflight", () => {
  test("reports Adapter-owned diagnostics before mount when a binding cannot provide a declared action", () => {
    const widget = defineWidget({
      name: "sku",
      valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
      interaction: FULL_WIDGET_INTERACTION,
    });
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "company",
          dependsOn: ["core"],
          contributes: { widgets: { sku: widget } },
        }),
      ],
    });
    const compiled = compileForm(
      defineForm({
        schema: { type: "object", properties: { code: { type: "string" } } },
        uiSchema: { fields: { code: { widget: "sku" } } },
      }),
      { environment },
    );
    const resolved = environment.widgets.get("sku");
    expect(resolved).toBeDefined();
    expect(JSON.stringify(compiled.model.ui)).not.toMatch(/onChange|FormInstance|addEventListener/);

    const adapter = createRecordingAdapter("recording", {
      sku: { widget: "sku", actions: ["setValue"] },
    });
    const diagnostics = preflightAdapter(resolved!, adapter);

    expect(adapter.writes).toEqual([]);
    expect(adapter.nativeEvents).toEqual([]);
    expect(diagnostics.map((item) => item.source)).toEqual(["adapter", "adapter", "adapter"]);
    expect(diagnostics.map((item) => item.metadata?.action)).toEqual(["touch", "focus", "blur"]);
    expect(diagnostics.every((item) => item.pluginId === "recording")).toBe(true);
  });

  test("does not copy native event or Runtime objects into Definition or Compiled Model", () => {
    const widget = defineWidget({
      name: "sku",
      valueContract: { jsonTypes: ["object"], canonical: "json-scalar" },
      interaction: { setValue: true },
    });
    expect(widget).not.toHaveProperty("onChange");
    expect(widget).not.toHaveProperty("component");
    const serialized = JSON.stringify(widget);
    expect(serialized).not.toMatch(/FormInstance|Store|Transaction|nativeEvent/);
  });
});
