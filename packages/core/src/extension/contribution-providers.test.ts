import { describe, expect, test } from "vitest";
import { PLUGIN_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { createFormEnvironment } from "./create-form-environment.js";
import { definePlugin } from "./plugin.js";
import { codesOf, expectBuildError } from "./environment.test-utils.js";
import type {
  SchemaDialectDefinition,
  SchemaExtensionDefinition,
  ValueInitializerDefinition,
} from "./contributions.js";

function sampleDialect(name: string, dialects: readonly string[]): SchemaDialectDefinition {
  return {
    name,
    dialects,
    convert: (schema) => ({ schema }),
  };
}

function sampleExtension(name: string, keyword: `x-${string}`): SchemaExtensionDefinition {
  return {
    name,
    keyword,
    split: () => ({}),
  };
}

function sampleInitializer(name: string): ValueInitializerDefinition {
  return {
    name,
    initialize: ({ initialValues }) => initialValues ?? {},
  };
}

describe("contribution providers", () => {
  test("registers dialect, extension, and initializer providers without executing them", () => {
    let converted = 0;
    let split = 0;
    let initialized = 0;
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "company",
          dependsOn: ["core"],
          contributes: {
            schemaDialects: {
              "draft-07": {
                name: "draft-07",
                dialects: ["http://json-schema.org/draft-07/schema#"],
                convert: (schema) => {
                  converted += 1;
                  return { schema };
                },
              },
            },
            schemaExtensions: {
              "x-ui": {
                name: "x-ui",
                keyword: "x-ui",
                split: () => {
                  split += 1;
                  return {};
                },
              },
            },
            valueInitializers: {
              "company.defaults": {
                name: "company.defaults",
                initialize: ({ initialValues }) => {
                  initialized += 1;
                  return initialValues ?? {};
                },
              },
            },
          },
        }),
      ],
    });

    expect(environment.schemaDialects.get("draft-07")?.name).toBe("draft-07");
    expect(environment.schemaDialects.get("draft-07")?.dialects).toEqual([
      "http://json-schema.org/draft-07/schema#",
    ]);
    expect(environment.schemaExtensions.get("x-ui")?.keyword).toBe("x-ui");
    expect(environment.valueInitializers.get("company.defaults")?.name).toBe("company.defaults");
    expect(environment.inspect("schemaDialects", "draft-07")?.pluginId).toBe("company");
    expect(environment.inspect("schemaExtensions", "x-ui")?.pluginId).toBe("company");
    expect(environment.inspect("valueInitializers", "company.defaults")?.pluginId).toBe("company");
    expect(Object.isFrozen(environment.schemaDialects.get("draft-07"))).toBe(true);
    expect(Object.isFrozen(environment.schemaExtensions.get("x-ui"))).toBe(true);
    expect(Object.isFrozen(environment.valueInitializers.get("company.defaults"))).toBe(true);
    expect(converted).toBe(0);
    expect(split).toBe(0);
    expect(initialized).toBe(0);
  });

  test("rejects key/name mismatches and illegal provider shapes atomically", () => {
    const mismatch = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "company",
            contributes: {
              schemaDialects: {
                "draft-07": sampleDialect("other", ["http://json-schema.org/draft-07/schema#"]),
              },
            },
          },
        ],
      }),
    );
    expect(codesOf(mismatch)).toEqual([PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR]);
    expect(mismatch.diagnostics[0]?.source).toBe("plugin");
    expect(mismatch.diagnostics[0]?.metadata).toMatchObject({
      registry: "schemaDialects",
      key: "draft-07",
      name: "other",
    });
    expect("environment" in mismatch).toBe(false);

    const missingConvert = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "company",
            contributes: {
              schemaDialects: {
                "draft-07": { name: "draft-07", dialects: ["http://json-schema.org/draft-07/schema#"] } as never,
              },
            },
          },
        ],
      }),
    );
    expect(codesOf(missingConvert)).toEqual([PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR]);
    expect(missingConvert.diagnostics[0]?.metadata).toMatchObject({
      registry: "schemaDialects",
      reason: "invalid-convert",
    });

    const missingSplit = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "company",
            contributes: {
              schemaExtensions: {
                "x-ui": { name: "x-ui", keyword: "x-ui" } as never,
              },
            },
          },
        ],
      }),
    );
    expect(missingSplit.diagnostics[0]?.metadata).toMatchObject({
      registry: "schemaExtensions",
      reason: "invalid-split",
    });

    const missingInitialize = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "company",
            contributes: {
              valueInitializers: {
                "company.defaults": { name: "company.defaults" } as never,
              },
            },
          },
        ],
      }),
    );
    expect(missingInitialize.diagnostics[0]?.metadata).toMatchObject({
      registry: "valueInitializers",
      reason: "invalid-initialize",
    });
  });

  test("rejects duplicate dialect URIs and extension keywords without last-write-wins", () => {
    const dialectConflict = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          definePlugin({
            id: "first",
            dependsOn: ["core"],
            contributes: {
              schemaDialects: {
                "draft-07": sampleDialect("draft-07", ["http://json-schema.org/draft-07/schema#"]),
              },
            },
          }),
          definePlugin({
            id: "second",
            dependsOn: ["core"],
            contributes: {
              schemaDialects: {
                legacy: sampleDialect("legacy", ["http://json-schema.org/draft-07/schema#"]),
              },
            },
          }),
        ],
      }),
    );
    expect(codesOf(dialectConflict)).toEqual([PLUGIN_DIAGNOSTIC_CODES.REGISTRY_CONFLICT]);
    expect(dialectConflict.diagnostics[0]?.source).toBe("plugin");
    expect(dialectConflict.diagnostics[0]?.metadata).toMatchObject({
      registry: "schemaDialects",
      uri: "http://json-schema.org/draft-07/schema#",
      existingPluginId: "first",
      incomingPluginId: "second",
    });
    expect("environment" in dialectConflict).toBe(false);

    const keywordConflict = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          definePlugin({
            id: "first",
            dependsOn: ["core"],
            contributes: {
              schemaExtensions: {
                ui: sampleExtension("ui", "x-ui"),
              },
            },
          }),
          definePlugin({
            id: "second",
            dependsOn: ["core"],
            contributes: {
              schemaExtensions: {
                layout: sampleExtension("layout", "x-ui"),
              },
            },
          }),
        ],
      }),
    );
    expect(keywordConflict.diagnostics[0]?.source).toBe("plugin");
    expect(keywordConflict.diagnostics[0]?.metadata).toMatchObject({
      registry: "schemaExtensions",
      keyword: "x-ui",
      existingPluginId: "first",
      incomingPluginId: "second",
    });
  });

  test("rejects non x- keywords and empty dialect URI collections", () => {
    const prefix = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "company",
            contributes: {
              schemaExtensions: {
                ui: { name: "ui", keyword: "ui", split: () => ({}) } as never,
              },
            },
          },
        ],
      }),
    );
    expect(codesOf(prefix)).toEqual([PLUGIN_DIAGNOSTIC_CODES.INVALID_DESCRIPTOR]);
    expect(prefix.diagnostics[0]?.source).toBe("plugin");
    expect(prefix.diagnostics[0]?.metadata).toMatchObject({
      registry: "schemaExtensions",
      keyword: "ui",
      pluginId: "company",
      reason: "invalid-keyword-prefix",
    });

    const properties = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "company",
            contributes: {
              schemaExtensions: {
                properties: { name: "properties", keyword: "properties", split: () => ({}) } as never,
              },
            },
          },
        ],
      }),
    );
    expect(properties.diagnostics[0]?.metadata).toMatchObject({
      keyword: "properties",
      reason: "invalid-keyword-prefix",
    });

    const empty = expectBuildError(() =>
      createFormEnvironment({
        plugins: [
          {
            id: "company",
            contributes: {
              schemaDialects: {
                "draft-07": { name: "draft-07", dialects: [], convert: (schema) => ({ schema }) },
              },
            },
          },
        ],
      }),
    );
    expect(empty.diagnostics[0]?.source).toBe("plugin");
    expect(empty.diagnostics[0]?.metadata).toMatchObject({
      registry: "schemaDialects",
      reason: "empty-dialects",
    });
  });

  test("accepts matching keys and exact overrides for the new registries", () => {
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "first",
          dependsOn: ["core"],
          contributes: {
            valueInitializers: {
              "company.defaults": sampleInitializer("company.defaults"),
            },
          },
        }),
        definePlugin({
          id: "second",
          dependsOn: ["core"],
          contributes: {
            valueInitializers: {
              "company.defaults": sampleInitializer("company.defaults"),
            },
          },
        }),
      ],
      overrides: [{ registry: "valueInitializers", key: "company.defaults", byPlugin: "second" }],
    });
    expect(environment.inspect("valueInitializers", "company.defaults")?.pluginId).toBe("second");
    expect(environment.valueInitializers.get("company.defaults")?.name).toBe("company.defaults");
  });
});
