import { describe, expect, test } from "vitest";
import { PLUGIN_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { createFormEnvironment } from "./create-form-environment.js";
import { CORE_PLUGIN_ID } from "../widget/built-in.js";
import { resolvePluginGraph } from "./dependency-graph.js";
import { codesOf, expectBuildError, widgetPlugin } from "./environment.test-utils.js";

describe("plugin dependency graph", () => {
  test("installs dependencies before dependents even when input order is reversed", () => {
    const feature = widgetPlugin("feature", "feature-widget", { dependsOn: ["base"] });
    const base = widgetPlugin("base", "base-widget");

    const first = createFormEnvironment({ plugins: [feature, base] });
    const second = createFormEnvironment({ plugins: [feature, base] });

    expect(first.pluginIds).toEqual([CORE_PLUGIN_ID, "base", "feature"]);
    expect(second.pluginIds).toEqual(first.pluginIds);
    const keys = [...first.widgets.keys()];
    expect(keys.indexOf("base-widget")).toBeLessThan(keys.indexOf("feature-widget"));
  });

  test("keeps the relative input order of independent plugins", () => {
    const alpha = widgetPlugin("alpha", "alpha-widget");
    const beta = widgetPlugin("beta", "beta-widget");

    expect(createFormEnvironment({ plugins: [alpha, beta] }).pluginIds).toEqual([
      CORE_PLUGIN_ID,
      "alpha",
      "beta",
    ]);
    expect(createFormEnvironment({ plugins: [alpha, beta] }).pluginIds).toEqual([
      CORE_PLUGIN_ID,
      "alpha",
      "beta",
    ]);
  });

  test("reports missing dependencies with a stable code and metadata", () => {
    const error = expectBuildError(() =>
      createFormEnvironment({
        plugins: [widgetPlugin("feature", "feature-widget", { dependsOn: ["ghost"] })],
      }),
    );

    expect(codesOf(error)).toEqual([PLUGIN_DIAGNOSTIC_CODES.MISSING_DEPENDENCY]);
    expect(error.diagnostics[0]?.pluginId).toBe("feature");
    expect(error.diagnostics[0]?.metadata).toEqual({
      pluginId: "feature",
      dependency: "ghost",
    });
  });

  test("stable topological sort prefers lower input ordinal among ready nodes", () => {
    const result = resolvePluginGraph([
      { id: "core", ordinal: 0, dependsOn: [] },
      { id: "feature", ordinal: 1, dependsOn: ["base"] },
      { id: "base", ordinal: 2, dependsOn: [] },
      { id: "extra", ordinal: 3, dependsOn: [] },
    ]);

    expect(result.order).toEqual(["core", "base", "feature", "extra"]);
    expect(result.missing).toEqual([]);
    expect(result.cycles).toEqual([]);
  });
});
