import { describe, expect, test } from "vitest";
import { definePlugin } from "./plugin.js";
import { createFormEnvironment } from "./create-form-environment.js";
import type { WidgetDefinition } from "../widget/widget.js";
import { FULL_WIDGET_INTERACTION } from "../widget/widget.js";

function sampleWidget(name: string): WidgetDefinition {
  return {
    name,
    valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
    interaction: FULL_WIDGET_INTERACTION,
  };
}

describe("definePlugin", () => {
  test("returns the same plugin identity without installing it", () => {
    const plugin = {
      id: "company.feature",
      contributes: {
        widgets: {
          sku: sampleWidget("sku"),
        },
      },
    };

    const authored = definePlugin(plugin);

    expect(authored).toBe(plugin);
    expect(createFormEnvironment().widgets.has("sku")).toBe(false);
  });

  test("repeated calls do not share newly created state", () => {
    const first = definePlugin({
      id: "a",
      contributes: { widgets: { one: sampleWidget("one") } },
    });
    const second = definePlugin({
      id: "b",
      contributes: { widgets: { two: sampleWidget("two") } },
    });

    expect(first).not.toBe(second);
    const environment = createFormEnvironment();
    expect(environment.widgets.has("one")).toBe(false);
    expect(environment.widgets.has("two")).toBe(false);
  });
});
