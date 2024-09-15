import { describe, expect, test } from "vitest";
import { compileForm, createForm, createFormEngine, defineForm } from "../index.js";
import { createFormEnvironment, definePlugin } from "../extension/index.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { formSelector, getRuntimeSnapshot, subscribeRuntime, valueSelector } from "./index.js";
import { compilePersonModel, expectRuntimeError } from "./runtime.test-utils.js";

describe("createForm and FormEngine", () => {
  test("creates an instance from the default environment", () => {
    const form = createForm(compilePersonModel(), { initialValues: { name: "Ada" } });
    expect(form.getValue("name")).toBe("Ada");
    expect(form.model.data.root.kind).toBe("object");
  });

  test("accepts the same explicit environment used to compile", () => {
    const environment = createFormEnvironment();
    const model = compilePersonModel(environment);
    const form = createForm(model, { environment, initialValues: { name: "Ada" } });
    expect(form.getValue("name")).toBe("Ada");
  });

  test("engine compile/create share identity and do not store instance state", () => {
    const engine = createFormEngine({
      plugins: [
        definePlugin({
          id: "company",
          dependsOn: ["core"],
          contributes: {
            widgets: {
              sku: {
                name: "sku",
                valueContract: { jsonTypes: ["string"], canonical: "json-scalar" },
              },
            },
          },
        }),
      ],
    });
    const { model } = engine.compile(
      defineForm({
        schema: { type: "object", properties: { code: { type: "string" } } },
        uiSchema: { fields: { code: { widget: "sku" } } },
      }),
    );
    const first = engine.create(model, { initialValues: { code: "A" } });
    first.setValue("code", "B");
    const second = engine.create(model, { initialValues: { code: "A" } });
    expect(first.getValue("code")).toBe("B");
    expect(second.getValue("code")).toBe("A");
    expect(second.getState().version).toBe(0);
    expect(engine).not.toHaveProperty("values");
    expect(engine).not.toHaveProperty("version");
  });

  test("rejects a model compiled by a different engine", () => {
    const left = createFormEngine();
    const right = createFormEngine();
    const { model } = left.compile(
      defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } }),
    );
    const error = expectRuntimeError(() => right.create(model));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.ENVIRONMENT_MISMATCH);
  });
});

describe("instance isolation", () => {
  test("mutations, reset, and subscriptions stay on the source instance", () => {
    const model = compilePersonModel();
    const frozenData = model.data;
    const first = createForm(model, { initialValues: { name: "Ada", age: 1 } });
    const second = createForm(model, { initialValues: { name: "Grace", age: 2 } });
    const seen: unknown[] = [];
    subscribeRuntime(second, valueSelector("name"), (value) => {
      seen.push(value);
    });
    first.setValue("name", "Linus");
    first.touch("name");
    first.reset();
    expect(second.getValue("name")).toBe("Grace");
    expect(second.getState().version).toBe(0);
    expect(second.getField("name").getState().touched).toBe(false);
    expect(seen).toEqual([]);
    expect(model.data).toBe(frozenData);
    expect(model).not.toHaveProperty("values");
  });
});

describe("value commands", () => {
  test("reads come from the same committed values snapshot", () => {
    const form = createForm(compilePersonModel(), {
      initialValues: { profile: { firstName: "Ada" } },
    });
    expect(form.getValue("profile.firstName")).toBe("Ada");
    expect(form.getField("profile.firstName").getValue()).toBe("Ada");
    expect((form.getState().values as { profile: { firstName: string } }).profile.firstName).toBe("Ada");
    expect(form.getField("profile.firstName").getState()).not.toHaveProperty("writableValue");
  });

  test("materializes missing optional object containers and replaces whole arrays", () => {
    const form = createForm(compilePersonModel(), { initialValues: {} });
    form.setValue("profile.firstName", "Ada");
    expect(form.getValues()).toEqual({ profile: { firstName: "Ada" } });
    form.setValue("tags", ["a", "b"]);
    expect(form.getValue("tags")).toEqual(["a", "b"]);
  });

  test("unknown paths and array indexes do not mutate", () => {
    const form = createForm(compilePersonModel(), { initialValues: { tags: ["a"] } });
    const before = form.getValues();
    const unknown = expectRuntimeError(() => form.setValue("missing", "x"));
    expect(unknown.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.UNKNOWN_PATH);
    const index = expectRuntimeError(() => form.setValue("tags[3]", "z"));
    expect(index.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.ARRAY_INDEX_OUT_OF_RANGE);
    expect(form.getValues()).toBe(before);
    expect(form.getState().version).toBe(0);
  });

  test("setValues is a single root-replacement commit", () => {
    const form = createForm(compilePersonModel(), {
      initialValues: { name: "Ada", age: 1, profile: { firstName: "A" } },
    });
    const pairs: string[] = [];
    subscribeRuntime(
      form,
      formSelector(),
      (snapshot) => {
        const values = snapshot.values as { name?: string; age?: number; profile?: { firstName?: string } };
        pairs.push(`${values.name}:${values.age}:${values.profile?.firstName}`);
      },
    );
    form.setValues({ name: "Grace", profile: { firstName: "Hopper" } });
    expect(form.getValues()).toEqual({ name: "Grace", profile: { firstName: "Hopper" } });
    expect(form.getState().version).toBe(1);
    expect(pairs).toEqual(["Grace:undefined:Hopper"]);
    expect(getRuntimeSnapshot(form, valueSelector("age"))).toBeUndefined();
  });
});
