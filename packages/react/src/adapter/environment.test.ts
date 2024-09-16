import { describe, expect, test } from "vitest";
import { defineReactUIAdapter } from "./define-adapter.js";
import { createReactRendererEnvironment } from "./create-environment.js";
import { RENDERER_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { RendererEnvironmentBuildError } from "./errors.js";
import { createRecordingAdapter } from "../test-utils/fake-adapter.js";
import type { ReactUIAdapter, WidgetBinding } from "./types.js";

function expectBuildError(run: () => unknown): RendererEnvironmentBuildError {
  try {
    const result = run();
    throw new Error(`Expected RendererEnvironmentBuildError but received ${String(result)}`);
  } catch (error) {
    if (error instanceof RendererEnvironmentBuildError) {
      expect("environment" in error).toBe(false);
      return error;
    }
    throw error;
  }
}

describe("defineReactUIAdapter", () => {
  test("is identity-preserving and has no side effects", () => {
    const adapter = createRecordingAdapter();
    expect(defineReactUIAdapter(adapter)).toBe(adapter);
  });
});

describe("createReactRendererEnvironment", () => {
  test("validates protocol, id, four roles and freezes the published environment", () => {
    const adapter = createRecordingAdapter("headless");
    const environment = createReactRendererEnvironment({ adapters: [adapter] });
    expect(environment.protocol).toEqual({ major: 1, minor: 0 });
    expect(environment.adapterIds).toEqual(["headless"]);
    const resolved = environment.getAdapter("headless");
    expect(resolved?.widgets.get("text")).toBeDefined();
    expect(resolved?.layouts.get("object")).toBeDefined();
    expect(Object.isFrozen(environment)).toBe(true);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(() => {
      (environment as { adapterIds: string[] }).adapterIds = ["x"];
    }).toThrow();
    expect(resolved?.widgets.inspect("text")?.owner).toBe("headless");
  });

  test("rejects duplicate widget keys without last-write-wins", () => {
    const base = createRecordingAdapter("headless");
    const replacement: WidgetBinding = {
      ...base.widgets.text!,
      custom: true,
    };
    const error = expectBuildError(() =>
      createReactRendererEnvironment({
        adapters: [base],
        contributions: [
          {
            owner: "app",
            adapterId: "headless",
            widgets: { text: replacement },
          },
        ],
      }),
    );
    expect(error.diagnostics.map((item) => item.code)).toEqual([RENDERER_DIAGNOSTIC_CODES.REGISTRY_CONFLICT]);
    expect(error.diagnostics[0]?.source).toBe("adapter");
    expect(error.diagnostics[0]?.metadata).toMatchObject({
      adapterId: "headless",
      registry: "widgets",
      key: "text",
      existingOwner: "headless",
      incomingOwner: "app",
    });
  });

  test("applies an exact owner override and fails wildcard, mismatch, and unused overrides", () => {
    const base = createRecordingAdapter("headless");
    const replacement: WidgetBinding = { ...base.widgets.text!, custom: true };
    const environment = createReactRendererEnvironment({
      adapters: [base],
      contributions: [{ owner: "app", adapterId: "headless", widgets: { text: replacement } }],
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
    expect(environment.inspect("headless", "widgets", "text")?.owner).toBe("app");
    expect(environment.getAdapter("headless")?.widgets.get("text")?.custom).toBe(true);

    const wildcard = expectBuildError(() =>
      createReactRendererEnvironment({
        adapters: [createRecordingAdapter("headless")],
        contributions: [{ owner: "app", adapterId: "headless", widgets: { text: replacement } }],
        overrides: [
          {
            adapterId: "*",
            registry: "widgets",
            key: "text",
            expectedOwner: "headless",
            replacementOwner: "app",
          },
        ],
      }),
    );
    expect(wildcard.diagnostics.some((item) => item.code === RENDERER_DIAGNOSTIC_CODES.OVERRIDE_WILDCARD)).toBe(true);

    const mismatch = expectBuildError(() =>
      createReactRendererEnvironment({
        adapters: [createRecordingAdapter("headless")],
        contributions: [{ owner: "app", adapterId: "headless", widgets: { text: replacement } }],
        overrides: [
          {
            adapterId: "headless",
            registry: "widgets",
            key: "text",
            expectedOwner: "other",
            replacementOwner: "app",
          },
        ],
      }),
    );
    expect(mismatch.diagnostics.some((item) => item.code === RENDERER_DIAGNOSTIC_CODES.OVERRIDE_OWNER_MISMATCH)).toBe(
      true,
    );

    const unused = expectBuildError(() =>
      createReactRendererEnvironment({
        adapters: [createRecordingAdapter("headless")],
        overrides: [
          {
            adapterId: "headless",
            registry: "widgets",
            key: "text",
            expectedOwner: "headless",
            replacementOwner: "app",
          },
        ],
      }),
    );
    expect(unused.diagnostics.map((item) => item.code)).toEqual([RENDERER_DIAGNOSTIC_CODES.OVERRIDE_UNUSED]);
  });

  test("aggregates malformed adapter diagnostics and redacts values", () => {
    const broken = {
      id: "broken",
      protocol: { min: { major: 1, minor: 0 } },
      widgets: {
        text: { render: () => null },
      },
    } as unknown as ReactUIAdapter;
    const error = expectBuildError(() => createReactRendererEnvironment({ adapters: [broken] }));
    expect(error.diagnostics.every((item) => item.source === "adapter")).toBe(true);
    expect(JSON.stringify(error.diagnostics)).not.toMatch(/password|nativeEvent|cause/);
    expect(error.diagnostics.some((item) => item.code === RENDERER_DIAGNOSTIC_CODES.MISSING_ROLE)).toBe(true);
    expect(error.diagnostics.some((item) => item.code === RENDERER_DIAGNOSTIC_CODES.INVALID_BINDING)).toBe(true);
  });
});
