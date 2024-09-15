import { describe, expect, test } from "vitest";
import { compileForm } from "../../compiler/compile-form.js";
import { createForm, createFormEngine } from "../../index.js";
import { createFormEnvironment, definePlugin } from "../../extension/index.js";
import { defineForm } from "../../definition/define-form.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import { expectRuntimeError } from "../runtime.test-utils.js";

function initializerEnvironment() {
  return createFormEnvironment({
    plugins: [
      definePlugin({
        id: "company",
        dependsOn: ["core"],
        contributes: {
          valueInitializers: {
            "company.defaults": {
              name: "company.defaults",
              initialize: ({ initialValues }) => {
                const base =
                  typeof initialValues === "object" && initialValues !== null && !Array.isArray(initialValues)
                    ? { ...initialValues }
                    : {};
                return { country: "CN", ...base };
              },
            },
            "company.override": {
              name: "company.override",
              initialize: () => ({ country: "US" }),
            },
            "company.products": {
              name: "company.products",
              initialize: () => ({
                products: [
                  { name: "A", price: 1 },
                  { name: "B", price: 2 },
                ],
              }),
            },
          },
          ruleFunctions: {
            "company.tax": { name: "company.tax", evaluate: (args) => args[0] ?? 0 },
          },
        },
      }),
    ],
  });
}

describe("value initializer", () => {
  test("fills missing values from the compiled default initializer", () => {
    const environment = initializerEnvironment();
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { name: { type: "string" }, country: { type: "string" } },
        },
        config: { valueInitializer: "company.defaults" },
      }),
      { environment },
    );
    const input = { name: "Ada" };
    const form = createForm(model, { environment, initialValues: input });
    expect(form.getValues()).toEqual({ name: "Ada", country: "CN" });
    expect(form.getState().version).toBe(0);
    expect(form.getState().dirty).toBe(false);
    expect(input).toEqual({ name: "Ada" });
  });

  test("lets create options override the compiled default without mutating the model", () => {
    const environment = initializerEnvironment();
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { country: { type: "string" } },
        },
        config: { valueInitializer: "company.defaults" },
      }),
      { environment },
    );
    const form = createForm(model, { environment, valueInitializer: "company.override" });
    expect(form.getValues()).toEqual({ country: "US" });
    expect(model.rule.serialization.valueInitializer).toBe("company.defaults");
  });

  test("reset restores the initializer snapshot without running it again", () => {
    let calls = 0;
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "company",
          dependsOn: ["core"],
          contributes: {
            valueInitializers: {
              "company.defaults": {
                name: "company.defaults",
                initialize: ({ initialValues }) => {
                  calls += 1;
                  return { ...(typeof initialValues === "object" && initialValues !== null ? initialValues : {}), country: "CN" };
                },
              },
            },
          },
        }),
      ],
    });
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { name: { type: "string" }, country: { type: "string" } },
        },
        config: { valueInitializer: "company.defaults" },
      }),
      { environment },
    );
    const form = createForm(model, { environment, initialValues: { name: "Ada" } });
    form.setValue("name", "Grace");
    form.reset();
    expect(form.getValues()).toEqual({ name: "Ada", country: "CN" });
    expect(calls).toBe(1);
  });

  test("runs before array identity and computed stabilization", () => {
    const environment = initializerEnvironment();
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            products: {
              type: "array",
              items: {
                type: "object",
                properties: { name: { type: "string" }, price: { type: "number" }, total: { type: "number" } },
              },
            },
          },
        },
        rules: [
          {
            kind: "computed",
            target: "products[].total",
            action: { value: { field: "products[].price" } },
          },
        ],
        config: { valueInitializer: "company.products" },
      }),
      { environment },
    );
    const form = createForm(model, { environment });
    const items = form.array("products").items();
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
    expect(form.getValue("products[0].total")).toBe(1);
    expect(form.getValue("products[1].total")).toBe(2);
  });

  test("blocks throw, thenable, and non-JSON results without a partial instance", () => {
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "company",
          dependsOn: ["core"],
          contributes: {
            valueInitializers: {
              boom: {
                name: "boom",
                initialize: () => {
                  throw new Error("secret stack");
                },
              },
              thenable: {
                name: "thenable",
                initialize: () => Promise.resolve({}) as never,
              },
              invalid: {
                name: "invalid",
                initialize: () => ({ name: () => "x" }) as never,
              },
            },
          },
        }),
      ],
    });
    const { model } = compileForm(
      defineForm({
        schema: { type: "object", properties: { name: { type: "string" } } },
      }),
      { environment },
    );
    for (const key of ["boom", "thenable", "invalid"] as const) {
      const error = expectRuntimeError(() => createForm(model, { environment, valueInitializer: key }));
      expect(error.diagnostics[0]?.source).toBe("runtime");
      expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.INITIALIZER_FAILED);
      expect(JSON.stringify(error.diagnostics[0])).not.toMatch(/secret stack/);
      expect(error).not.toHaveProperty("values");
    }
  });

  test("rejects an unregistered option key before creating stores", () => {
    const environment = initializerEnvironment();
    const { model } = compileForm(
      defineForm({
        schema: { type: "object", properties: { country: { type: "string" } } },
        config: { valueInitializer: "company.defaults" },
      }),
      { environment },
    );
    const error = expectRuntimeError(() => createForm(model, { environment, valueInitializer: "missing" }));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.INITIALIZER_UNKNOWN);
    expect(error.diagnostics[0]?.source).toBe("runtime");
  });

  test("checks environment identity before running an initializer", () => {
    const environment = initializerEnvironment();
    const other = createFormEnvironment();
    const { model } = compileForm(
      defineForm({
        schema: { type: "object", properties: { country: { type: "string" } } },
        config: { valueInitializer: "company.defaults" },
      }),
      { environment },
    );
    const error = expectRuntimeError(() => createForm(model, { environment: other, valueInitializer: "company.defaults" }));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.ENVIRONMENT_MISMATCH);
  });

  test("engine.create accepts a valueInitializer override", () => {
    const engine = createFormEngine({
      plugins: [
        definePlugin({
          id: "company",
          dependsOn: ["core"],
          contributes: {
            valueInitializers: {
              "company.defaults": {
                name: "company.defaults",
                initialize: () => ({ country: "CN" }),
              },
              "company.override": {
                name: "company.override",
                initialize: () => ({ country: "US" }),
              },
            },
          },
        }),
      ],
    });
    const { model } = engine.compile(
      defineForm({
        schema: { type: "object", properties: { country: { type: "string" } } },
        config: { valueInitializer: "company.defaults" },
      }),
    );
    const form = engine.create(model, { valueInitializer: "company.override" });
    expect(form.getValues()).toEqual({ country: "US" });
  });
});
