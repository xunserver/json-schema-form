import { describe, expect, test } from "vitest";
import { defineVueUIAdapter } from "./define-adapter.js";
import { createVueRendererEnvironment } from "./create-environment.js";
import { RENDERER_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { RendererEnvironmentBuildError } from "./errors.js";
import { createRecordingAdapter } from "../test-utils/fake-adapter.js";
import type { VueUIAdapter, WidgetBinding } from "./types.js";

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

describe("defineVueUIAdapter", () => {
  test("is identity-preserving and has no side effects", () => {
    const adapter = createRecordingAdapter();
    expect(defineVueUIAdapter(adapter)).toBe(adapter);
  });
});

describe("createVueRendererEnvironment", () => {
  test("validates protocol, id, four roles and freezes the published environment", () => {
    const adapter = createRecordingAdapter("element-plus");
    const environment = createVueRendererEnvironment({ adapters: [adapter] });
    expect(environment.protocol).toEqual({ major: 1, minor: 0 });
    expect(environment.adapterIds).toEqual(["element-plus"]);
    const resolved = environment.getAdapter("element-plus");
    expect(resolved?.widgets.get("text")).toBeDefined();
    expect(resolved?.layouts.get("object")).toBeDefined();
    expect(Object.isFrozen(environment)).toBe(true);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(() => {
      (environment as { adapterIds: string[] }).adapterIds = ["x"];
    }).toThrow();
    expect(resolved?.widgets.inspect("text")?.owner).toBe("element-plus");
  });

  test("rejects duplicate widget keys without last-write-wins", () => {
    const base = createRecordingAdapter("element-plus");
    const replacement: WidgetBinding = {
      ...base.widgets.text!,
      custom: true,
    };
    const error = expectBuildError(() =>
      createVueRendererEnvironment({
        adapters: [base],
        contributions: [
          {
            owner: "app",
            adapterId: "element-plus",
            widgets: { text: replacement },
          },
        ],
      }),
    );
    expect(error.diagnostics.map((item) => item.code)).toEqual([RENDERER_DIAGNOSTIC_CODES.REGISTRY_CONFLICT]);
    expect(error.diagnostics[0]?.source).toBe("adapter");
    expect(error.diagnostics[0]?.metadata).toMatchObject({
      adapterId: "element-plus",
      registry: "widgets",
      key: "text",
      existingOwner: "element-plus",
      incomingOwner: "app",
    });
  });

  test("applies an exact owner override and fails wildcard, mismatch, and unused overrides", () => {
    const base = createRecordingAdapter("element-plus");
    const replacement: WidgetBinding = { ...base.widgets.text!, custom: true };
    const environment = createVueRendererEnvironment({
      adapters: [base],
      contributions: [{ owner: "app", adapterId: "element-plus", widgets: { text: replacement } }],
      overrides: [
        {
          adapterId: "element-plus",
          registry: "widgets",
          key: "text",
          expectedOwner: "element-plus",
          replacementOwner: "app",
        },
      ],
    });
    expect(environment.inspect("element-plus", "widgets", "text")?.owner).toBe("app");
    expect(environment.getAdapter("element-plus")?.widgets.get("text")?.custom).toBe(true);

    const wildcard = expectBuildError(() =>
      createVueRendererEnvironment({
        adapters: [createRecordingAdapter("element-plus")],
        contributions: [{ owner: "app", adapterId: "element-plus", widgets: { text: replacement } }],
        overrides: [
          {
            adapterId: "*",
            registry: "widgets",
            key: "text",
            expectedOwner: "element-plus",
            replacementOwner: "app",
          },
        ],
      }),
    );
    expect(wildcard.diagnostics.some((item) => item.code === RENDERER_DIAGNOSTIC_CODES.OVERRIDE_WILDCARD)).toBe(true);

    const mismatch = expectBuildError(() =>
      createVueRendererEnvironment({
        adapters: [createRecordingAdapter("element-plus")],
        contributions: [{ owner: "app", adapterId: "element-plus", widgets: { text: replacement } }],
        overrides: [
          {
            adapterId: "element-plus",
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
      createVueRendererEnvironment({
        adapters: [createRecordingAdapter("element-plus")],
        overrides: [
          {
            adapterId: "element-plus",
            registry: "widgets",
            key: "text",
            expectedOwner: "element-plus",
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
    } as unknown as VueUIAdapter;
    const error = expectBuildError(() => createVueRendererEnvironment({ adapters: [broken] }));
    expect(error.diagnostics.every((item) => item.source === "adapter")).toBe(true);
    expect(JSON.stringify(error.diagnostics)).not.toMatch(/password|nativeEvent|cause/);
    expect(error.diagnostics.some((item) => item.code === RENDERER_DIAGNOSTIC_CODES.MISSING_ROLE)).toBe(true);
    expect(error.diagnostics.some((item) => item.code === RENDERER_DIAGNOSTIC_CODES.INVALID_BINDING)).toBe(true);
  });
});
