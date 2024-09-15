import { describe, expect, test } from "vitest";
import { PLUGIN_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { createFormEnvironment } from "./create-form-environment.js";
import { REGISTRY_KINDS, type RegistryKind } from "./registry.js";
import type { FormPlugin } from "./plugin.js";
import { codesOf, expectBuildError, sampleWidget } from "./environment.test-utils.js";

function contribution(kind: RegistryKind, key: string): FormPlugin["contributes"] {
  switch (kind) {
    case "widgets":
      return { widgets: { [key]: sampleWidget(key) } };
    case "schemaDialects":
      return { schemaDialects: { [key]: { id: key } } };
    case "schemaExtensions":
      return { schemaExtensions: { [key]: { keyword: key } } };
    case "ruleFunctions":
      return { ruleFunctions: { [key]: { name: key, evaluate: (args) => args[0] ?? null } } };
    case "validators":
      return {
        validators: {
          [key]: { name: key, kind: "sync", validate: () => [] },
        },
      };
    case "serializers":
      return { serializers: { [key]: { name: key, serialize: (value) => value } } };
    case "valueInitializers":
      return { valueInitializers: { [key]: { name: key } } };
    case "instrumentation":
      return { instrumentation: { [key]: { name: key } } };
  }
}

describe("registry conflicts", () => {
  test.each(REGISTRY_KINDS)("rejects an unapproved %s key conflict", (kind) => {
    const error = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          { id: "first", contributes: contribution(kind, "shared") },
          { id: "second", contributes: contribution(kind, "shared") },
        ],
      }),
    );

    expect(codesOf(error)).toEqual([PLUGIN_DIAGNOSTIC_CODES.REGISTRY_CONFLICT]);
    expect(error.diagnostics[0]?.metadata).toEqual({
      registry: kind,
      key: "shared",
      existingPluginId: "first",
      incomingPluginId: "second",
    });
  });

  test("includes provenance for a default widget key conflict", () => {
    const error = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "company",
            contributes: {
              widgets: {
                text: sampleWidget("company-text"),
              },
            },
          },
        ],
      }),
    );

    expect(error.diagnostics[0]?.metadata).toEqual({
      registry: "widgets",
      key: "text",
      existingPluginId: "core",
      incomingPluginId: "company",
    });
  });
});
