import { describe, expect, test } from "vitest";
import { createFormEnvironment } from "./create-form-environment.js";
import { sampleWidget, widgetPlugin } from "./environment.test-utils.js";

describe("environment isolation", () => {
  test("repeated builds with the same input are semantically equivalent and isolated", () => {
    const plugin = widgetPlugin("company", "sku");
    const first = createFormEnvironment({ plugins: [plugin] });
    const second = createFormEnvironment({ plugins: [plugin] });

    expect(first).not.toBe(second);
    expect([...first.pluginIds]).toEqual([...second.pluginIds]);
    expect(first.widgets.get("sku")?.name).toBe(second.widgets.get("sku")?.name);
    expect(first.widgets.get("text")?.name).toBe(second.widgets.get("text")?.name);
    expect(first.widgets.get("sku")).not.toBe(second.widgets.get("sku"));
  });

  test("user contributions do not leak across environments", () => {
    const left = createFormEnvironment({ plugins: [widgetPlugin("left", "left-widget")] });
    const right = createFormEnvironment({ plugins: [widgetPlugin("right", "right-widget")] });

    expect(left.widgets.has("left-widget")).toBe(true);
    expect(left.widgets.has("right-widget")).toBe(false);
    expect(right.widgets.has("right-widget")).toBe(true);
    expect(right.widgets.has("left-widget")).toBe(false);
  });

  test("mutating the original authoring object or public views does not change a published registry", () => {
    const widget = sampleWidget("sku");
    const plugin = {
      id: "company",
      contributes: {
        widgets: {
          sku: widget,
        },
      },
    };
    const environment = createFormEnvironment({ plugins: [plugin] });

    widget.name = "mutated";
    plugin.contributes.widgets.sku = sampleWidget("replaced");
    expect(environment.widgets.get("sku")?.name).toBe("sku");

    expect(() => {
      (environment.pluginIds as string[]).push("intruder");
    }).toThrow();
    expect(() => {
      (environment.widgets as { set?: (key: string, value: unknown) => void }).set?.("intruder", sampleWidget("intruder"));
    }).not.toThrow();
    expect(environment.widgets.has("intruder")).toBe(false);
    expect(environment.pluginIds).not.toContain("intruder");
    expect(typeof (environment.widgets as { set?: unknown }).set).toBe("undefined");
  });
});
