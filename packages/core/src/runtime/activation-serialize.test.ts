import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "../index.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import {
  effectiveStateSelector,
  fieldSelector,
  formSelector,
  observeRuntimeDiagnostics,
  subscribeRuntime,
  valueSelector,
} from "./index.js";
import { compileRules, sampleProducts, taxEnvironment } from "./rules.test-utils.js";
import { expectRuntimeError } from "./runtime.test-utils.js";
import { createFormEnvironment, definePlugin } from "../extension/index.js";
import { defineRuleFunction } from "../extension/define-rule-function.js";

describe("schema activation", () => {
  test("activates exclusive oneOf nodes without mutating the compiled model", () => {
    const environment = taxEnvironment();
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { kind: { type: "string" } },
          oneOf: [
            { properties: { kind: { const: "company" }, company: { type: "string" } }, required: ["kind"] },
            { properties: { kind: { const: "person" }, person: { type: "string" } }, required: ["kind"] },
          ],
        },
        uiSchema: {
          fields: {
            kind: { field: false },
            company: { field: false },
            person: { field: false },
          },
        },
      }),
      { environment },
    );
    const frozen = model.data;
    const form = createForm(model, { environment, initialValues: { kind: "company", company: "Acme", person: "Ada" } });
    expect(form.getField("company").getState().active).toBe(true);
    expect(form.getField("person").getState().active).toBe(false);
    form.setValue("person", "Grace");
    expect(form.getValue("person")).toBe("Grace");
    form.setValue("kind", "person");
    expect(form.getField("person").getState().active).toBe(true);
    expect(form.getField("company").getState().active).toBe(false);
    expect(form.getValue("company")).toBe("Acme");
    expect(form.getValue("person")).toBe("Grace");
    expect(model.data).toBe(frozen);
    form.setValue("kind", "company");
    expect(form.getField("company").getState().active).toBe(true);
    expect(form.getValue("company")).toBe("Acme");
  });

  test("if/dependentSchemas use property presence rather than truthiness", () => {
    const environment = taxEnvironment();
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { kind: { type: "string" }, creditCard: { type: "string" } },
          if: { properties: { kind: { const: "company" } }, required: ["kind"] },
          then: { properties: { company: { type: "string" } } },
          else: { properties: { person: { type: "string" } } },
          dependentSchemas: {
            creditCard: { properties: { billing: { type: "string" } } },
          },
        },
      }),
      { environment },
    );
    const form = createForm(model, {
      environment,
      initialValues: { kind: "company", creditCard: "", billing: "keep", company: "Acme", person: "Ada" },
    });
    expect(form.getField("company").getState().active).toBe(true);
    expect(form.getField("person").getState().active).toBe(false);
    expect(form.getField("billing").getState().active).toBe(true);
    form.setValue("kind", "person");
    expect(form.getField("person").getState().active).toBe(true);
    expect(form.getField("company").getState().active).toBe(false);
  });

  test("oneOf ambiguity is a non-blocking diagnostic and does not pick a fallback branch", () => {
    const environment = taxEnvironment();
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { kind: { type: "string" } },
          oneOf: [
            { properties: { kind: { const: "company" }, company: { type: "string" } }, required: ["kind"] },
            { properties: { kind: { const: "person" }, person: { type: "string" } }, required: ["kind"] },
          ],
        },
        uiSchema: {
          fields: {
            kind: { field: false },
            company: { field: false },
            person: { field: false },
          },
        },
      }),
      { environment },
    );
    const form = createForm(model, { environment, initialValues: { kind: "company", company: "Acme" } });
    const codes: string[] = [];
    let formRuns = 0;
    observeRuntimeDiagnostics(form, (event) => {
      codes.push(...event.diagnostics.map((item) => item.code));
    });
    subscribeRuntime(form, formSelector(), () => {
      formRuns += 1;
    });
    form.setValue("kind", "unknown");
    expect(form.getField("company").getState().active).toBe(false);
    expect(form.getField("person").getState().active).toBe(false);
    expect(form.getValue("kind")).toBe("unknown");
    expect(form.getState().version).toBe(1);
    expect(codes).toContain(RUNTIME_DIAGNOSTIC_CODES.ONEOF_AMBIGUOUS);
    expect(formRuns).toBe(1);
  });
});

describe("effective state", () => {
  test("combines schema, UI, rule, and computed gates without last-writer-wins", () => {
    const { model, environment } = compileRules({
      uiSchema: {
        fields: {
          hidden: { behavior: { visible: false } },
          region: { behavior: { disabled: true } },
        },
      },
      rules: [
        { kind: "state", target: "hidden", action: { active: true } },
        { kind: "state", target: "region", action: { disabled: false, readonly: false } },
        { kind: "computed", target: "total", action: { value: { field: "amount" } } },
      ],
    });
    const form = createForm(model, { environment, initialValues: sampleProducts() });
    expect(form.getState().active).toBe(true);
    expect(form.getField("hidden").getState()).toMatchObject({ active: true, visible: false });
    form.setValue("hidden", "still-active");
    expect(form.getValue("hidden")).toBe("still-active");
    expect(form.getField("region").getState().disabled).toBe(true);
    expect(form.getField("total").getState().readonly).toBe(true);
  });

  test("recomputes only the affected field and leaves sibling selectors idle", () => {
    const { model, environment } = compileRules({
      rules: [
        {
          kind: "state",
          target: "region",
          action: { visible: { eq: [{ field: "country" }, "CN"] } },
        },
        {
          kind: "state",
          target: "hidden",
          action: { visible: true },
        },
      ],
    });
    const form = createForm(model, { environment, initialValues: sampleProducts() });
    let regionRuns = 0;
    let hiddenRuns = 0;
    subscribeRuntime(
      form,
      effectiveStateSelector("region"),
      () => {
        regionRuns += 1;
      },
    );
    subscribeRuntime(
      form,
      effectiveStateSelector("hidden"),
      () => {
        hiddenRuns += 1;
      },
    );
    const hiddenSnapshot = form.getField("hidden").getState();
    form.setValue("country", "US");
    expect(form.getField("region").getState().visible).toBe(false);
    expect(regionRuns).toBe(1);
    expect(hiddenRuns).toBe(0);
    expect(form.getField("hidden").getState()).toBe(hiddenSnapshot);
  });
});

describe("serialize", () => {
  test("prunes inactive nodes by compiled policy and keeps falsey values", () => {
    const environment = taxEnvironment();
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            kind: { type: "string" },
            count: { type: "number" },
            enabled: { type: "boolean" },
            label: { type: "string" },
            products: {
              type: "array",
              items: { type: "object", properties: { name: { type: "string" }, kind: { type: "string" } } },
            },
          },
          if: { properties: { kind: { const: "company" } }, required: ["kind"] },
          then: { properties: { company: { type: "string" } } },
          else: { properties: { person: { type: "string" } } },
        },
        rules: [{ kind: "state", target: "products[]", action: { active: { eq: [{ field: "products[].kind" }, "keep"] } } }],
      }),
      { environment },
    );
    const form = createForm(model, {
      environment,
      initialValues: {
        kind: "company",
        count: 0,
        enabled: false,
        label: "",
        company: "Acme",
        person: "Ada",
        products: [
          { name: "a", kind: "keep" },
          { name: "b", kind: "drop" },
          { name: "c", kind: "keep" },
        ],
      },
    });
    expect(form.getValues()).toMatchObject({ person: "Ada", products: [{ name: "a" }, { name: "b" }, { name: "c" }] });
    const serialized = form.serialize() as Record<string, unknown>;
    expect(serialized).toMatchObject({ kind: "company", count: 0, enabled: false, label: "", company: "Acme" });
    expect(serialized).not.toHaveProperty("person");
    expect(serialized.products).toEqual([
      { name: "a", kind: "keep" },
      { name: "c", kind: "keep" },
    ]);
    expect(form.serialize({ includeInactive: true })).toMatchObject({ person: "Ada" });
    expect(form.getState().version).toBe(0);
  });

  test("runs a named serializer after prune and isolates failures", () => {
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "company",
          dependsOn: ["core"],
          contributes: {
            serializers: {
              "company.payload": {
                name: "company.payload",
                serialize: (value, context) => ({ value, version: context.version, includeInactive: context.includeInactive }),
              },
              "company.boom": {
                name: "company.boom",
                serialize: () => {
                  throw new Error("nope");
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
          properties: { kind: { type: "string" } },
          if: { properties: { kind: { const: "company" } }, required: ["kind"] },
          then: { properties: { company: { type: "string" } } },
          else: { properties: { person: { type: "string" } } },
        },
        config: { serializer: "company.payload", serializeInactive: false },
      }),
      { environment },
    );
    const form = createForm(model, { environment, initialValues: { kind: "company", company: "Acme", person: "Ada" } });
    expect(form.serialize()).toEqual({
      value: { kind: "company", company: "Acme" },
      version: 0,
      includeInactive: false,
    });
    expect(form.serialize({ includeInactive: true })).toEqual({
      value: { kind: "company", company: "Acme", person: "Ada" },
      version: 0,
      includeInactive: true,
    });
    const before = form.getState().version;
    const error = expectRuntimeError(() => form.serialize({ serializer: "company.boom" }));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.SERIALIZER_FAILED);
    expect(form.getState().version).toBe(before);
    const unknown = expectRuntimeError(() => form.serialize({ serializer: "missing" }));
    expect(unknown.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.SERIALIZER_UNKNOWN);
  });
});

describe("negative deferred capabilities", () => {
  test("rejects async rule functions, dynamic paths, and compiled model mutation", () => {
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "company",
          dependsOn: ["core"],
          contributes: {
            ruleFunctions: {
              "company.async": defineRuleFunction({
                name: "company.async",
                evaluate: () => Promise.resolve(1) as unknown as number,
              }),
            },
          },
        }),
      ],
    });
    const { model } = compileForm(
      defineForm({
        schema: { type: "object", properties: { total: { type: "number" } } },
        rules: [{ kind: "computed", target: "total", action: { value: { call: "company.async", args: [] } } }],
      }),
      { environment },
    );
    expect(() => createForm(model, { environment, initialValues: { total: 0 } })).toThrow();
    expect(() =>
      compileForm(
        defineForm({
          schema: { type: "object", properties: { name: { type: "string" } } },
          rules: [{ kind: "computed", target: "name", action: { value: { field: "products[0].name" } } }],
        }),
      ),
    ).toThrow();
    const staticModel = compileForm(defineForm({ schema: { type: "object", properties: { name: { type: "string" } } } })).model;
    expect(() => {
      (staticModel.rule as { rules: unknown[] }).rules.push({});
    }).toThrow();
  });
});
