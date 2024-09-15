import { compileForm, createForm, defineForm } from "@form/core";
import { describe, expect, test } from "vitest";
import { createReactRendererEnvironment } from "./create-environment.js";
import { RendererCapabilityError } from "./errors.js";
import { preflightCapabilities } from "./preflight.js";
import { createRecordingAdapter } from "../test-utils/fake-adapter.js";
import { createPersonForm } from "../test-utils/forms.js";
import type { WidgetBinding } from "./types.js";

describe("capability preflight", () => {
  test("missing widget binding blocks native mount and has no HTML fallback", () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: {
            type: "object",
            properties: { when: { type: "string", format: "date-time" } },
          },
        }),
      ).model,
      { initialValues: { when: "2026-09-15T00:00:00Z" } },
    );
    const adapter = createRecordingAdapter("headless");
    const { datetime: _removed, ...widgets } = adapter.widgets;
    void _removed;
    const environment = createReactRendererEnvironment({
      adapters: [
        {
          ...adapter,
          widgets,
        },
      ],
    });
    const resolved = environment.getAdapter("headless");
    expect(resolved).toBeDefined();
    expect(() => preflightCapabilities(form, resolved!)).toThrow(RendererCapabilityError);
    try {
      preflightCapabilities(form, resolved!);
    } catch (error) {
      expect(error).toBeInstanceOf(RendererCapabilityError);
      const capability = error as RendererCapabilityError;
      expect(capability.diagnostics[0]?.source).toBe("adapter");
      expect(capability.diagnostics[0]?.metadata).toMatchObject({ adapterId: "headless", key: "datetime" });
      expect(JSON.stringify(capability.diagnostics)).not.toContain("2026-09-15");
    }
  });

  test("explicit custom render satisfies the same widget key", () => {
    const form = createPersonForm();
    const adapter = createRecordingAdapter("headless");
    const custom: WidgetBinding = { ...adapter.widgets.text!, custom: true };
    const environment = createReactRendererEnvironment({
      adapters: [adapter],
      contributions: [{ owner: "app", adapterId: "headless", widgets: { text: custom } }],
      overrides: [
        {
          adapterId: "headless",
          registry: "widgets",
          key: "text",
          expectedOwner: "headless",
          replacementOwner: "app",
        },
      ],
    });
    expect(() => preflightCapabilities(form, environment.getAdapter("headless")!)).not.toThrow();
  });
});
