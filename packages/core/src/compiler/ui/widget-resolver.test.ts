import { describe, expect, test } from "vitest";
import type { FormEnvironment } from "../../extension/environment.js";
import { createRegistry } from "../../extension/registry.js";
import type { WidgetDefinition } from "../../widget/widget.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import { asModelPath } from "../../model/path/index.js";
import { DiagnosticBag } from "../diagnostics.js";
import { resolveWidget } from "./widget-resolver.js";

function stubEnvironment(widget: WidgetDefinition): FormEnvironment {
  const widgets = createRegistry([{ key: widget.name, pluginId: "test", value: widget }]);
  return {
    widgets,
    inspect(kind, key) {
      return kind === "widgets" ? widgets.inspect(key) : undefined;
    },
  } as FormEnvironment;
}

describe("widget resolver interaction compatibility", () => {
  test("rejects a selected widget whose interaction contract is not consumable", () => {
    const diagnostics = new DiagnosticBag();
    const definition = {
      name: "broken",
      valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
    } as WidgetDefinition;
    const node = {
      kind: "scalar" as const,
      id: "data:name" as never,
      path: asModelPath("name"),
      schemaRef: "#" as never,
      schemaRefs: ["#" as never],
      valueType: "string" as const,
      nullable: false,
    };

    const resolved = resolveWidget(
      node,
      { widget: "broken" },
      stubEnvironment(definition),
      diagnostics,
      asModelPath("name"),
    );

    expect(resolved).toBeUndefined();
    const diagnostic = diagnostics.snapshot()[0];
    expect(diagnostic?.code).toBe(COMPILER_DIAGNOSTIC_CODES.WIDGET_INCOMPATIBLE);
    expect(diagnostic?.source).toBe("compiler");
    expect(diagnostic?.modelPath).toBe("name");
    expect(diagnostic?.metadata).toMatchObject({ widget: "broken", reason: "missing-interaction" });
  });
});
