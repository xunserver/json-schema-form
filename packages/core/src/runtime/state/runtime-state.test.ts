import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "../../index.js";
import { createFormEnvironment } from "../../extension/create-form-environment.js";
import { peekEnvironmentIdentity } from "../../engine/environment-identity.js";
import { peekModelEnvironment } from "../../engine/model-provenance.js";
import { FormRuntimeError } from "../error.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import { FieldStateStore, NodeStateStore, ValueStoreImpl } from "./stores.js";
import { compilePersonModel, expectRuntimeError } from "../runtime.test-utils.js";

describe("environment identity provenance", () => {
  test("matches the same environment identity and hides the token from public objects", () => {
    const environment = createFormEnvironment();
    const { model } = compileForm(
      defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } }),
      { environment },
    );
    const form = createForm(model, { environment, initialValues: { name: "Ada" } });
    expect(form.getValue("name")).toBe("Ada");
    expect(peekEnvironmentIdentity(environment)?.token).toBe(peekModelEnvironment(model)?.token);
    expect(Object.getOwnPropertySymbols(environment)).toEqual([]);
    expect(JSON.stringify(environment)).not.toMatch(/FormEnvironment/);
  });

  test("rejects a different environment with the same plugin list", () => {
    const first = createFormEnvironment();
    const second = createFormEnvironment();
    const { model } = compileForm(
      defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } }),
      { environment: first },
    );
    const error = expectRuntimeError(() => createForm(model, { environment: second }));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.ENVIRONMENT_MISMATCH);
  });

  test("shares the default environment between compileForm and createForm", () => {
    const { model } = compileForm(
      defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } }),
    );
    const form = createForm(model, { initialValues: { name: "Ada" } });
    expect(form.getValue("name")).toBe("Ada");
  });
});

describe("separated source-state stores", () => {
  test("Field and Node stores do not copy values", () => {
    const values = new ValueStoreImpl({ name: "Ada" });
    const fields = new FieldStateStore();
    const nodes = new NodeStateStore();
    fields.touched.set("name", true);
    nodes.entries.set("name", {});
    expect(fields).not.toHaveProperty("value");
    expect(nodes.entries.get("name")).toEqual({});
    expect(values.current).toEqual({ name: "Ada" });
  });

  test("focused is stored per view and touched per field", () => {
    const model = compilePersonModel();
    const form = createForm(model, { initialValues: { name: "Ada" } });
    const views = collectFieldViews(model.ui.viewTree);
    form.touch("name");
    if (views[0] !== undefined) {
      form.focus(views[0].id);
    }
    expect(form.getField("name").getState().touched).toBe(true);
    expect(form.getField("age").getState().touched).toBe(false);
  });
});

describe("derived dirty and touched", () => {
  test("dirty recovers after a value round-trip and is not a writable source", () => {
    const form = createForm(compilePersonModel(), { initialValues: { name: "A", age: 1 } });
    form.setValue("name", "B");
    expect(form.getField("name").getState().dirty).toBe(true);
    expect(form.getState().dirty).toBe(true);
    form.setValue("name", "A");
    expect(form.getField("name").getState().dirty).toBe(false);
    expect(form.getField("age").getState().dirty).toBe(false);
    expect(form.getState().dirty).toBe(false);
    expect(form.getField("name").getState()).not.toHaveProperty("setDirty");
  });

  test("descendant touch aggregates to ancestors without marking siblings", () => {
    const form = createForm(compilePersonModel(), {
      initialValues: { profile: { firstName: "Ada", lastName: "Lovelace" } },
    });
    form.touch("profile.firstName");
    expect(form.getField("profile.firstName").getState().touched).toBe(true);
    expect(form.getField("profile").getState().touched).toBe(true);
    expect(form.getState().touched).toBe(true);
    expect(form.getField("profile.lastName").getState().touched).toBe(false);
  });
});

describe("readonly snapshot cache", () => {
  test("returns the same snapshot reference when revisions are unchanged", () => {
    const form = createForm(compilePersonModel(), { initialValues: { name: "Ada", age: 1 } });
    const first = form.getState();
    const field = form.getField("age").getState();
    expect(form.getState()).toBe(first);
    expect(form.getField("age").getState()).toBe(field);
    form.setValue("name", "Grace");
    expect(form.getState()).not.toBe(first);
    expect(form.getField("age").getState()).toBe(field);
    expect(form.getState()).toHaveProperty("active", true);
    expect(form.getState()).toHaveProperty("visible", true);
    expect(form.getState()).toHaveProperty("valid", true);
    expect(form.getState()).toHaveProperty("errors");
  });

  test("rejects using a public snapshot as a mutation channel", () => {
    const form = createForm(compilePersonModel(), { initialValues: { profile: { firstName: "Ada" } } });
    const values = form.getValues() as { profile: { firstName: string } };
    expect(() => {
      values.profile.firstName = "Grace";
    }).toThrow();
    expect(form.getValue("profile.firstName")).toBe("Ada");
    expect(form.getState().version).toBe(0);
  });
});

describe("createForm failures", () => {
  test("invalid model or values do not return a partial instance", () => {
    let thrown: unknown;
    try {
      createForm({} as never);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FormRuntimeError);
    expect(thrown).not.toHaveProperty("form");

    const model = compilePersonModel();
    const invalid = expectRuntimeError(() => createForm(model, { initialValues: { name: () => "Ada" } }));
    expect(invalid.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.INVALID_VALUE);
  });
});

function collectFieldViews(
  node: { kind: string; children?: readonly unknown[]; itemLayout?: readonly unknown[]; id: string; fieldPath?: string },
): { id: never }[] {
  const views: { id: never }[] = [];
  if (node.kind === "field") {
    views.push({ id: node.id as never });
  }
  for (const child of node.children ?? []) {
    views.push(...collectFieldViews(child as never));
  }
  for (const child of node.itemLayout ?? []) {
    views.push(...collectFieldViews(child as never));
  }
  return views;
}
