import { describe, expect, test } from "vitest";
import { PLUGIN_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { createFormEnvironment } from "./create-form-environment.js";
import { codesOf, expectBuildError, sampleWidget, widgetPlugin } from "./environment.test-utils.js";

describe("plugin identity validation", () => {
  test("rejects empty and whitespace plugin ids in input ordinal order", () => {
    const error = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          widgetPlugin("", "one"),
          widgetPlugin("  spaced  ", "two"),
        ],
      }),
    );

    expect(codesOf(error)).toEqual([
      PLUGIN_DIAGNOSTIC_CODES.INVALID_ID,
      PLUGIN_DIAGNOSTIC_CODES.INVALID_ID,
    ]);
    expect(error.diagnostics[0]?.source).toBe("plugin");
  });

  test("rejects duplicate plugin ids and does not allow registry overrides to admit them", () => {
    const first = widgetPlugin("company", "alpha");
    const second = {
      id: "company",
      contributes: {
        widgets: {
          beta: sampleWidget("beta"),
        },
      },
    };

    const error = expectBuildError(() =>
      createFormEnvironment({
        plugins: [first, second],
        overrides: [{ registry: "widgets", key: "beta", byPlugin: "company" }],
      }),
    );

    expect(codesOf(error)).toEqual([PLUGIN_DIAGNOSTIC_CODES.DUPLICATE_ID]);
    expect(error.diagnostics[0]?.pluginId).toBe("company");
    expect(error.diagnostics[0]?.metadata).toMatchObject({ pluginId: "company" });
  });
});
