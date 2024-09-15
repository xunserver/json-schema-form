import { describe, expect, test } from "vitest";
import { PLUGIN_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { createFormEnvironment } from "./create-form-environment.js";
import { codesOf, expectBuildError, widgetPlugin } from "./environment.test-utils.js";

describe("plugin dependency cycles", () => {
  test("reports a self-cycle without publishing an environment", () => {
    const error = expectBuildError(() =>
      createFormEnvironment({
        plugins: [widgetPlugin("loop", "loop-widget", { dependsOn: ["loop"] })],
      }),
    );

    expect(codesOf(error)).toEqual([PLUGIN_DIAGNOSTIC_CODES.DEPENDENCY_CYCLE]);
    expect(error.diagnostics[0]?.metadata).toEqual({
      cycle: ["loop", "loop"],
    });
  });

  test("reports a multi-plugin cycle with a deterministic path", () => {
    const error = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          widgetPlugin("a", "a-widget", { dependsOn: ["b"] }),
          widgetPlugin("b", "b-widget", { dependsOn: ["c"] }),
          widgetPlugin("c", "c-widget", { dependsOn: ["a"] }),
        ],
      }),
    );

    expect(codesOf(error)).toEqual([PLUGIN_DIAGNOSTIC_CODES.DEPENDENCY_CYCLE]);
    expect(error.diagnostics[0]?.metadata?.cycle).toEqual(["a", "c", "b", "a"]);
  });

  test("repeats the same diagnostic order for identical cyclic input", () => {
    const plugins = [
      widgetPlugin("a", "a-widget", { dependsOn: ["b"] }),
      widgetPlugin("b", "b-widget", { dependsOn: ["a"] }),
    ];

    const first = expectBuildError(() => createFormEnvironment({ plugins }));
    const second = expectBuildError(() => createFormEnvironment({ plugins }));

    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(first.diagnostics[0]?.metadata?.cycle).toEqual(["a", "b", "a"]);
  });
});
