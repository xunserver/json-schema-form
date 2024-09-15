import { describe, expect, test } from "vitest";
import { PLUGIN_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { createFormEnvironment } from "./create-form-environment.js";
import { CORE_EXTENSION_PROTOCOL } from "./protocol.js";
import { codesOf, expectBuildError, widgetPlugin } from "./environment.test-utils.js";

describe("plugin protocol compatibility", () => {
  test("accepts a plugin whose range includes protocol 1.0", () => {
    const environment = createFormEnvironment({
      plugins: [
        widgetPlugin("compat", "sku", {
          protocol: { min: { major: 1, minor: 0 }, maxExclusive: { major: 2, minor: 0 } },
        }),
      ],
    });

    expect(environment.pluginIds).toContain("compat");
    expect(environment.widgets.has("sku")).toBe(true);
  });

  test("rejects incompatible and malformed protocol ranges with stable metadata", () => {
    const tooNew = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          widgetPlugin("future", "sku", {
            protocol: { min: { major: 1, minor: 1 } },
          }),
        ],
      }),
    );
    expect(codesOf(tooNew)).toEqual([PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_INCOMPATIBLE]);
    expect(tooNew.diagnostics[0]?.pluginId).toBe("future");
    expect(tooNew.diagnostics[0]?.source).toBe("plugin");
    expect(tooNew.diagnostics[0]?.metadata).toMatchObject({
      current: CORE_EXTENSION_PROTOCOL,
    });

    const closedUpper = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          widgetPlugin("legacy", "sku", {
            protocol: { min: { major: 0, minor: 1 }, maxExclusive: { major: 1, minor: 0 } },
          }),
        ],
      }),
    );
    expect(codesOf(closedUpper)).toEqual([PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_INCOMPATIBLE]);

    const malformed = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          widgetPlugin("broken", "sku", {
            protocol: { min: { major: 1, minor: Number.NaN } },
          }),
        ],
      }),
    );
    expect(codesOf(malformed)).toEqual([PLUGIN_DIAGNOSTIC_CODES.PROTOCOL_INCOMPATIBLE]);
  });
});
