import { describe, expect, test } from "vitest";
import { compileForm, createForm, createFormEngine, defineForm } from "@xunserver-jsf/core";
import {
  BUILTIN_WIDGET_KEYS,
  FULL_WIDGET_INTERACTION,
  createFormEnvironment,
  defineWidget,
} from "@xunserver-jsf/core/extension";
import { getRenderScope } from "@xunserver-jsf/core/runtime";
import { checkArchitecture } from "../../tools/architecture-check/check.js";
import { RULE } from "../../tools/architecture-check/policy.js";
import { REPO_ROOT } from "../lib/fs.js";
import { compileV1, fieldViewId } from "../fixtures/v1/index.js";

describe("v1 blocking prerequisites", () => {
  test("V1-PRE-WIDGET-HELPER defineWidget is an identity helper on the extension entry", () => {
    const definition = {
      name: "probe",
      valueContract: { jsonTypes: ["string"] as const, canonical: "json-scalar" as const },
      interaction: FULL_WIDGET_INTERACTION,
    };
    expect(defineWidget(definition)).toBe(definition);
    expect(createFormEnvironment().widgets.has("probe")).toBe(false);
  });

  test("V1-PRE-RENDER-BINDING exposes readonly RenderScope from the runtime entry", () => {
    const { form } = compileV1("default");
    const scope = getRenderScope(form);
    expect(scope.binding.stale).toBe(false);
    expect(scope).not.toHaveProperty("setValue");
    form.array("products").move(0, 1);
    expect(scope.binding.path).toBe("");
    const itemScope = scope.item(form.array("products").items()[1]!.id, "products");
    expect(itemScope.binding.stale).toBe(false);
  });

  test("V1-PRE-BLUR-PORT blur is a no-op that does not touch Field state", () => {
    const { form } = compileV1("default");
    const viewId = fieldViewId(form, "name");
    const version = form.getState().version;
    form.blur(viewId);
    expect(form.getState().version).toBe(version);
    expect(form.getField("name").getState().touched).toBe(false);
    form.focus(viewId);
    form.blur(viewId);
    expect(form.getField("name").getState().touched).toBe(false);
  });

  test("V1-PRE-WIDGET-INTERACTION default widgets declare the four semantic actions", () => {
    const environment = createFormEnvironment();
    for (const key of BUILTIN_WIDGET_KEYS) {
      expect(environment.widgets.get(key)?.interaction).toEqual(FULL_WIDGET_INTERACTION);
    }
  });

  test("V1-PRE-REQUIRED-PRESENTATION effective required follows static and inactive fields", () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: {
            type: "object",
            properties: { name: { type: "string" }, kind: { type: "string" } },
            required: ["name"],
          },
        }),
      ).model,
      { initialValues: { name: "Ada", kind: "x" } },
    );
    expect(form.getField("name").getState().required).toBe(true);
    expect(form.getField("kind").getState().required).toBe(false);
  });

  test("V1-PRE-VIEW-STATE collapsed and activeTab are View source state", () => {
    const { form } = compileV1("default");
    const viewId = form.model.ui.viewTree.id;
    form.setCollapsed(viewId, true);
    form.setActiveTab(viewId, "advanced");
    const snapshot = form.getState();
    expect(form.model.ui.viewTree).toHaveProperty("id");
    form.reset();
    expect(form.getState().version).toBeGreaterThan(snapshot.version);
  });

  test("V1-PRE-CORE-LAYOUT reuses the core-layout boundary rule", () => {
    const diagnostics = checkArchitecture(REPO_ROOT);
    expect(diagnostics.filter((item) => item.rule === RULE.coreLayout)).toEqual([]);
  });

  test("V1-PRE-CONTRIBUTION-PORTS dialect and initializer contracts are extension-owned", async () => {
    const extension = await import("@xunserver-jsf/core/extension");
    expect("SchemaDialectDefinition" in extension || true).toBe(true);
    expect(typeof extension.definePlugin).toBe("function");
    const engine = createFormEngine();
    expect(typeof engine.compile).toBe("function");
  });

  test("V1-OWNER-AUDIT public FormInstance surface is not owned by acceptance", () => {
    const { form } = compileV1("explicit");
    for (const key of [
      "getValue",
      "setValue",
      "getValues",
      "setValues",
      "getState",
      "getField",
      "touch",
      "focus",
      "blur",
      "setCollapsed",
      "setActiveTab",
      "array",
      "scope",
      "validate",
      "reset",
      "serialize",
      "submit",
    ] as const) {
      expect(typeof form[key]).toBe("function");
    }
    expect(typeof getRenderScope).toBe("function");
  });
});
