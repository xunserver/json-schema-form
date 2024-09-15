import { describe, expect, test } from "vitest";
import { defineWidget } from "./define-widget.js";
import { createFormEnvironment } from "../extension/create-form-environment.js";
import { EnvironmentBuildError } from "../extension/environment-build-error.js";
import { definePlugin } from "../extension/plugin.js";
import { FULL_WIDGET_INTERACTION } from "./widget.js";

describe("defineWidget", () => {
  test("returns the same object identity without installing or freezing it", () => {
    const definition = {
      name: "sku",
      valueContract: { jsonTypes: ["string"] as const, canonical: "json-scalar" as const },
      interaction: FULL_WIDGET_INTERACTION,
    };

    const authored = defineWidget(definition);

    expect(authored).toBe(definition);
    expect(createFormEnvironment().widgets.has("sku")).toBe(false);
    expect(Object.isFrozen(authored)).toBe(false);
  });

  test("repeated calls do not install widgets or share registry state", () => {
    const first = defineWidget({
      name: "one",
      valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
      interaction: { setValue: true },
    });
    const second = defineWidget({
      name: "one",
      valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
      interaction: { setValue: true },
    });

    expect(first).not.toBe(second);
    const environment = createFormEnvironment();
    expect(environment.widgets.has("one")).toBe(false);
    expect(environment.widgets.get("text")?.name).toBe("text");
  });

  test("same-key authoring does not conflict until Environment build", () => {
    const left = defineWidget({
      name: "sku",
      valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
      interaction: { setValue: true },
    });
    const right = defineWidget({
      name: "sku",
      valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
      interaction: { setValue: true },
    });
    expect(left).not.toBe(right);

    expect(() =>
      createFormEnvironment({
        plugins: [
          definePlugin({ id: "left", contributes: { widgets: { sku: left } } }),
          definePlugin({ id: "right", contributes: { widgets: { sku: right } } }),
        ],
      }),
    ).toThrow(EnvironmentBuildError);
  });
});
