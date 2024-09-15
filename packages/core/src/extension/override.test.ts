import { describe, expect, test } from "vitest";
import { PLUGIN_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { createFormEnvironment } from "./create-form-environment.js";
import { codesOf, expectBuildError, sampleWidget, widgetPlugin } from "./environment.test-utils.js";

describe("registry overrides", () => {
  test("applies an exact allowlist override and records a warning", () => {
    const company = {
      id: "company",
      contributes: {
        widgets: {
          text: sampleWidget("company-text"),
        },
      },
    };

    const environment = createFormEnvironment({
      plugins: [company],
      overrides: [{ registry: "widgets", key: "text", byPlugin: "company" }],
    });

    expect(environment.widgets.get("text")?.name).toBe("company-text");
    expect(environment.inspect("widgets", "text")?.pluginId).toBe("company");
    expect(environment.diagnostics).toHaveLength(1);
    expect(environment.diagnostics[0]?.code).toBe(PLUGIN_DIAGNOSTIC_CODES.REGISTRY_OVERRIDE);
    expect(environment.diagnostics[0]?.severity).toBe("warning");
    expect(environment.diagnostics[0]?.metadata).toEqual({
      registry: "widgets",
      key: "text",
      existingPluginId: "core",
      incomingPluginId: "company",
    });
  });

  test("does not silently apply broad, mismatched, or unused override permissions", () => {
    const company = {
      id: "company",
      contributes: {
        widgets: {
          text: sampleWidget("company-text"),
        },
      },
    };

    const mismatched = expectBuildError(() =>
      createFormEnvironment({
        plugins: [company],
        overrides: [{ registry: "widgets", key: "text", byPlugin: "other" }],
      }),
    );
    expect(codesOf(mismatched)).toEqual([PLUGIN_DIAGNOSTIC_CODES.REGISTRY_CONFLICT]);

    const wrongKey = expectBuildError(() =>
      createFormEnvironment({
        plugins: [company],
        overrides: [{ registry: "widgets", key: "number", byPlugin: "company" }],
      }),
    );
    expect(codesOf(wrongKey)).toEqual([PLUGIN_DIAGNOSTIC_CODES.REGISTRY_CONFLICT]);

    const unused = createFormEnvironment({
      plugins: [widgetPlugin("helper", "sku")],
      overrides: [{ registry: "widgets", key: "text", byPlugin: "company" }],
    });
    expect(unused.widgets.get("text")?.name).toBe("text");
    expect(unused.inspect("widgets", "text")?.pluginId).toBe("core");
    expect(unused.diagnostics).toEqual([]);
  });
});
