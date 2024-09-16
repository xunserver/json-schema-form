import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm, FormRuntimeError } from "@xunserver-jsf/core";
import { createFormEnvironment, definePlugin, defineRuleFunction } from "@xunserver-jsf/core/extension";
import { effectiveStateSelector, formSelector, subscribeRuntime } from "@xunserver-jsf/core/runtime";

describe("rules and schema dynamics end-to-end", () => {
  test("keeps values, effective state, version, and notifications atomic across branch and array edits", () => {
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "company",
          dependsOn: ["core"],
          contributes: {
            ruleFunctions: {
              "company.tax": defineRuleFunction({
                name: "company.tax",
                evaluate: (args) => {
                  const quantity = typeof args[0] === "number" ? args[0] : 0;
                  const price = typeof args[1] === "number" ? args[1] : 0;
                  return quantity * price;
                },
              }),
            },
            serializers: {
              "company.payload": {
                name: "company.payload",
                serialize: (value) => ({ payload: value }),
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
          properties: {
            kind: { type: "string" },
            country: { type: "string" },
            products: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  quantity: { type: "number" },
                  price: { type: "number" },
                  total: { type: "number" },
                },
              },
            },
          },
          if: { properties: { kind: { const: "company" } }, required: ["kind"] },
          then: { properties: { company: { type: "string" } } },
          else: { properties: { person: { type: "string" } } },
        },
        rules: [
          {
            kind: "state",
            target: "country",
            action: { visible: { eq: [{ field: "kind" }, "company"] } },
          },
          {
            kind: "computed",
            target: "products[].total",
            action: {
              value: {
                call: "company.tax",
                args: [{ field: "products[].quantity" }, { field: "products[].price" }],
              },
            },
          },
          {
            kind: "effect",
            when: { eq: [{ field: "kind" }, "company"] },
            action: { actions: [{ type: "setValue", target: "country", value: "CN" }] },
          },
          {
            kind: "validation",
            target: "country",
            action: { assertion: true, failure: { code: "ok", message: "ok" } },
          },
        ],
        config: { serializer: "company.payload" },
      }),
      { environment },
    );
    const form = createForm(model, {
      environment,
      initialValues: {
        kind: "company",
        country: "US",
        company: "Acme",
        person: "Ada",
        products: [
          { quantity: 2, price: 5, total: 0 },
          { quantity: 1, price: 8, total: 0 },
        ],
      },
    });
    expect(form.getState().version).toBe(0);
    expect(form.getValue("country")).toBe("CN");
    expect(form.getValue("products[0].total")).toBe(10);
    expect(form.getField("country").getState().visible).toBe(true);
    expect(form.getField("company").getState().active).toBe(true);
    expect(form.getField("person").getState().active).toBe(false);

    const snapshots: string[] = [];
    subscribeRuntime(form, formSelector(), (snapshot) => {
      const values = snapshot.values as { kind?: string; country?: string; products?: { total?: number }[] };
      snapshots.push(`${values.kind}:${values.country}:${values.products?.[0]?.total}:${snapshot.version}`);
    });
    let personEffective = 0;
    subscribeRuntime(form, effectiveStateSelector("person"), () => {
      personEffective += 1;
    });
    personEffective = 0;

    form.array("products").item(0).setValue("quantity", 3);
    expect(form.getValue("products[0].total")).toBe(15);
    expect(form.getValue("products[1].total")).toBe(8);
    expect(form.getState().version).toBe(1);
    expect(snapshots).toEqual(["company:CN:15:1"]);

    form.setValue("kind", "person");
    expect(form.getField("person").getState().active).toBe(true);
    expect(form.getField("company").getState().active).toBe(false);
    expect(form.getValue("company")).toBe("Acme");
    expect(form.getField("country").getState().visible).toBe(false);
    expect(form.getState().version).toBe(2);
    expect(personEffective).toBe(1);

    form.setValue("kind", "company");
    expect(form.getField("company").getState().active).toBe(true);
    expect(form.getValue("country")).toBe("CN");
    expect(form.serialize()).toEqual({
      payload: {
        kind: "company",
        country: "CN",
        company: "Acme",
        products: [
          { quantity: 3, price: 5, total: 15 },
          { quantity: 1, price: 8, total: 8 },
        ],
      },
    });
    expect(typeof form.validate).toBe("function");
    expect(form.getState()).toHaveProperty("valid");
    expect(() => {
      throw new FormRuntimeError([]);
    }).toThrow(FormRuntimeError);
  });
});
