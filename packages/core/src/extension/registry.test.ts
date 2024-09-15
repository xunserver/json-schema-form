import { describe, expect, test } from "vitest";
import { createRegistry } from "./registry.js";
import type { WidgetDefinition } from "../widget/widget.js";

const text: WidgetDefinition = {
  name: "text",
  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
  interaction: { setValue: true },
};

const number: WidgetDefinition = {
  name: "number",
  valueContract: { jsonTypes: ["number"], canonical: "json-scalar" },
  interaction: { setValue: true },
};

describe("createRegistry", () => {
  const registry = createRegistry([
    { key: "text", pluginId: "core", value: text },
    { key: "number", pluginId: "core", value: number },
  ]);

  test("supports lookup, size, and determined iteration order", () => {
    expect(registry.size).toBe(2);
    expect(registry.has("text")).toBe(true);
    expect(registry.get("text")).toBe(text);
    expect(registry.get("missing")).toBeUndefined();
    expect([...registry.keys()]).toEqual(["text", "number"]);
    expect([...registry.values()].map((widget) => widget.name)).toEqual(["text", "number"]);
    expect([...registry.entries()].map(([key]) => key)).toEqual(["text", "number"]);
    expect([...registry].map(([key]) => key)).toEqual(["text", "number"]);
  });

  test("exposes readonly provenance inspection without mutation methods", () => {
    expect(registry.inspect("text")).toEqual({
      key: "text",
      pluginId: "core",
      value: text,
    });
    expect(registry.inspectAll().map((entry) => entry.pluginId)).toEqual(["core", "core"]);
    expect("set" in registry).toBe(false);
    expect("delete" in registry).toBe(false);
    expect("clear" in registry).toBe(false);
    expect(typeof (registry as { set?: unknown }).set).toBe("undefined");
    expect(registry).not.toBeInstanceOf(Map);
  });

  test("isolates callers from the internal entry store", () => {
    const inspections = registry.inspectAll();
    expect(Object.isFrozen(inspections)).toBe(true);
    expect(Object.isFrozen(inspections[0])).toBe(true);
    expect(Object.isFrozen(registry)).toBe(true);
  });
});
