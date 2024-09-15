import { describe, expect, test } from "vitest";
import { BUILTIN_WIDGET_KEYS } from "../widget/widget.js";
import { CORE_PLUGIN_ID } from "../widget/built-in.js";
import { PLUGIN_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { createFormEnvironment } from "./create-form-environment.js";
import { CORE_EXTENSION_PROTOCOL } from "./protocol.js";
import { codesOf, expectBuildError, sampleWidget, widgetPlugin } from "./environment.test-utils.js";

describe("createFormEnvironment", () => {
  test("builds a frozen default environment from the core plugin", () => {
    const environment = createFormEnvironment();

    expect(environment.protocol).toEqual(CORE_EXTENSION_PROTOCOL);
    expect(environment.pluginIds).toEqual([CORE_PLUGIN_ID]);
    expect(environment.diagnostics).toEqual([]);
    expect(Object.isFrozen(environment)).toBe(true);
    expect(Object.isFrozen(environment.pluginIds)).toBe(true);
    expect(Object.isFrozen(environment.diagnostics)).toBe(true);
    expect(Object.isFrozen(environment.widgets)).toBe(true);
    expect([...environment.widgets.keys()]).toEqual([...BUILTIN_WIDGET_KEYS].toSorted());
  });

  test("builds an explicit environment that only contains provided plugins plus core", () => {
    const environment = createFormEnvironment({
      plugins: [widgetPlugin("company", "sku")],
    });

    expect(environment.pluginIds).toEqual([CORE_PLUGIN_ID, "company"]);
    expect(environment.widgets.has("sku")).toBe(true);
    expect(environment.widgets.has("text")).toBe(true);
  });

  test("aggregates independent errors and never returns a partial environment", () => {
    const error = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          widgetPlugin("feature", "shared", { dependsOn: ["ghost"] }),
          widgetPlugin("other", "shared"),
        ],
      }),
    );

    expect(codesOf(error).sort()).toEqual(
      [
        PLUGIN_DIAGNOSTIC_CODES.MISSING_DEPENDENCY,
        PLUGIN_DIAGNOSTIC_CODES.REGISTRY_CONFLICT,
      ].sort(),
    );
    expect(error.diagnostics.every((diagnostic) => diagnostic.source === "plugin")).toBe(true);
  });

  test("rejects illegal contribution shapes during clone", () => {
    class Widget {
      name = "classy";
      valueContract = { jsonTypes: ["string"], canonical: "json-scalar" as const };
    }

    const error = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "classy",
            contributes: {
              widgets: {
                classy: new Widget() as never,
              },
            },
          },
        ],
      }),
    );

    expect(codesOf(error)).toEqual([PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR]);
    expect(error.diagnostics[0]?.metadata).toMatchObject({
      registry: "widgets",
      key: "classy",
      reason: "non-plain-object",
    });
  });

  test("freezes successful warnings so callers cannot mutate them", () => {
    const environment = createFormEnvironment({
      plugins: [
        {
          id: "company",
          contributes: { widgets: { text: sampleWidget("company-text") } },
        },
      ],
      overrides: [{ registry: "widgets", key: "text", byPlugin: "company" }],
    });

    expect(Object.isFrozen(environment.diagnostics)).toBe(true);
    expect(Object.isFrozen(environment.diagnostics[0]?.metadata)).toBe(true);
  });

  test("rejects widgets whose interaction contract is missing, unknown, or executable", () => {
    const missing = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "missing-set-value",
            contributes: {
              widgets: {
                broken: {
                  name: "broken",
                  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
                  interaction: {},
                } as never,
              },
            },
          },
        ],
      }),
    );
    expect(codesOf(missing)).toEqual([PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR]);
    expect(missing.diagnostics[0]?.source).toBe("plugin");
    expect(missing.diagnostics[0]?.metadata).toMatchObject({
      registry: "widgets",
      key: "broken",
      reason: "missing-setValue",
    });
    expect("environment" in missing).toBe(false);

    const unknown = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "unknown-action",
            contributes: {
              widgets: {
                broken: {
                  name: "broken",
                  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
                  interaction: { setValue: true, submit: true },
                } as never,
              },
            },
          },
        ],
      }),
    );
    expect(unknown.diagnostics[0]?.metadata).toMatchObject({
      registry: "widgets",
      reason: "unknown-action",
      action: "submit",
    });

    const handler = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "runtime-handler",
            contributes: {
              widgets: {
                broken: {
                  name: "broken",
                  valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
                  interaction: { setValue: true, onChange: () => undefined },
                } as never,
              },
            },
          },
        ],
      }),
    );
    expect(handler.diagnostics[0]?.metadata).toMatchObject({
      registry: "widgets",
      reason: "runtime-handler",
    });
  });
});
