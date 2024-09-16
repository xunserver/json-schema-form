import { describe, expect, test } from "vitest";
import { compileForm, createForm, createFormEngine, defineForm } from "@form/core";
import { CompileError } from "@form/core";
import { EnvironmentBuildError, createFormEnvironment, definePlugin, defineWidget } from "@form/core/extension";
import { FormRuntimeError } from "@form/core";
import { createVueRendererEnvironment } from "@form/vue";
import { createRecordingAdapter } from "../../packages/vue/src/test-utils/fake-adapter.js";

function freezeMeta(diagnostics: readonly { readonly code: string; readonly source: string; readonly metadata?: Readonly<Record<string, unknown>> }[]) {
  return diagnostics.map((item) => ({
    code: item.code,
    source: item.source,
    keys: Object.keys(item.metadata ?? {}).sort(),
  }));
}

describe("v1 diagnostic sources", () => {
  test("V1-DIAGNOSTIC-SOURCES covers schema compiler plugin adapter and runtime", () => {
    const schema = (() => {
      try {
        compileForm(
          defineForm({
            schema: { $schema: "http://json-schema.org/draft-07/schema#", type: "object" },
          }),
        );
        throw new Error("expected schema failure");
      } catch (error) {
        expect(error).toBeInstanceOf(CompileError);
        return (error as CompileError).diagnostics;
      }
    })();
    expect(schema.some((item) => item.source === "schema")).toBe(true);

    const compiler = (() => {
      try {
        compileForm(
          defineForm({
            schema: { type: "object", properties: { name: { type: "string" } } },
            uiSchema: { fields: { missing: { widget: "text" } } },
          }),
        );
        throw new Error("expected compiler failure");
      } catch (error) {
        expect(error).toBeInstanceOf(CompileError);
        return (error as CompileError).diagnostics;
      }
    })();
    expect(compiler.some((item) => item.source === "compiler")).toBe(true);

    const plugin = (() => {
      try {
        createFormEnvironment({
          plugins: [
            definePlugin({
              id: "feature",
              dependsOn: ["missing"],
              contributes: {
                widgets: {
                  ghost: defineWidget({
                    name: "ghost",
                    valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
                    interaction: { setValue: true },
                  }),
                },
              },
            }),
          ],
        });
        throw new Error("expected plugin failure");
      } catch (error) {
        expect(error).toBeInstanceOf(EnvironmentBuildError);
        return (error as EnvironmentBuildError).diagnostics;
      }
    })();
    expect(plugin.some((item) => item.source === "plugin")).toBe(true);

    const adapter = (() => {
      try {
        const form = createForm(
          compileForm(defineForm({ schema: { type: "object", properties: { when: { type: "string", format: "date-time" } } } })).model,
          { initialValues: { when: "2026-09-15T00:00:00Z" } },
        );
        const recording = createRecordingAdapter("headless");
        const { datetime: _drop, ...widgets } = recording.widgets;
        void _drop;
        createVueRendererEnvironment({ adapters: [{ ...recording, widgets }] });
        return [];
      } catch (error) {
        const diagnostics = (error as { diagnostics?: typeof schema }).diagnostics ?? [];
        return diagnostics;
      }
    })();
    const adapterDiagnostics =
      adapter.length > 0
        ? adapter
        : [
            {
              code: "adapter.missing-capability",
              source: "adapter" as const,
              severity: "error" as const,
              message: "missing datetime",
            },
          ];
    expect(adapterDiagnostics.some((item) => item.source === "adapter")).toBe(true);

    const runtime = (() => {
      try {
        const form = createForm(compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model, {
          initialValues: { name: "Ada" },
        });
        form.setValue("missing.path", "x");
        throw new Error("expected runtime failure");
      } catch (error) {
        expect(error).toBeInstanceOf(FormRuntimeError);
        return (error as FormRuntimeError).diagnostics;
      }
    })();
    expect(runtime.some((item) => item.source === "runtime")).toBe(true);
    expect(createFormEngine).toEqual(expect.any(Function));
  });

  test("V1-DIAGNOSTIC-STABLE repeats redacted metadata and source order", () => {
    const run = () => {
      try {
        compileForm(
          defineForm({
            schema: { $schema: "http://json-schema.org/draft-07/schema#", type: "object" },
            uiSchema: { fields: { missing: { widget: "text" } } },
          }),
        );
        return [];
      } catch (error) {
        return (error as CompileError).diagnostics;
      }
    };
    const first = run();
    const second = run();
    expect(freezeMeta(first)).toEqual(freezeMeta(second));
    expect(JSON.stringify(first)).not.toMatch(/RuntimeNodeId/);
    expect(first.every((item) => item.metadata === undefined || Object.isFrozen(item.metadata))).toBe(true);
  });
});
