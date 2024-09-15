import { describe, expect, test } from "vitest";
import { createForm } from "../index.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "./diagnostic-codes.js";
import { FormRuntimeError } from "./error.js";
import {
  formSelector,
  subscribeRuntime,
  valueSelector,
} from "./index.js";
import { createFormWithTestHooks, peekFormRuntime } from "./test-harness.js";
import { compileRules, sampleProducts } from "./rules.test-utils.js";
import { expectRuntimeError } from "./runtime.test-utils.js";

describe("rule scheduler and array lifecycle", () => {
  test("materializes independent item rule instances without exposing scheduler keys", () => {
    const { model, environment } = compileRules({
      rules: [
        {
          kind: "computed",
          target: "products[].total",
          action: { value: { field: "products[].quantity" } },
        },
      ],
    });
    const form = createForm(model, { environment, initialValues: sampleProducts() });
    expect(form.getValue("products[0].total")).toBe(2);
    expect(form.getValue("products[1].total")).toBe(1);
    expect(form).not.toHaveProperty("engine");
    expect(JSON.stringify(form.getState())).not.toMatch(/RuntimeNodeId|rule:\d+/);
    const runtime = peekFormRuntime(form);
    expect(runtime.engine.stats.scheduledRules).toBeGreaterThan(0);
  });

  test("move keeps item identity while remove drops orphan rule work", () => {
    const { model, environment } = compileRules({
      rules: [
        {
          kind: "computed",
          target: "products[].total",
          action: { value: { field: "products[].price" } },
        },
      ],
    });
    const form = createForm(model, { environment, initialValues: sampleProducts() });
    const firstId = form.array("products").items()[0]?.id;
    const second = form.array("products").items()[1];
    form.array("products").move(0, 1);
    expect(form.array("products").items()[1]?.id).toBe(firstId);
    expect(form.getValue("products[1].total")).toBe(5);
    form.array("products").remove(0);
    expect(form.array("products").items()).toHaveLength(1);
    expect(form.array("products").items()[0]?.id).toBe(firstId);
    expect(second).toBeDefined();
    let siblingRuns = 0;
    subscribeRuntime(form, valueSelector("products[0].total"), () => {
      siblingRuns += 1;
    });
    form.array("products").append({ quantity: 3, price: 9, total: 0 });
    expect(form.getValue("products[1].total")).toBe(9);
    expect(siblingRuns).toBe(0);
  });
});

describe("transaction phases and rule categories", () => {
  test("runs activation before rules on the same draft revision", () => {
    const order: string[] = [];
    const { model, environment } = compileRules({
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
      rules: [{ kind: "state", target: "company", action: { visible: true } }],
    });
    const form = createFormWithTestHooks(
      model,
      { environment, initialValues: { kind: "company", company: "Acme" } },
      {
        phases: {
          activation: () => {
            order.push("activation");
          },
          rule: () => {
            order.push("rule");
          },
          syncValidation: () => {
            order.push("syncValidation");
          },
        },
      },
    );
    const versions: number[] = [];
    subscribeRuntime(form, formSelector(), (snapshot) => {
      versions.push(snapshot.version);
    });
    form.setValue("kind", "person");
    expect(order).toEqual(["activation", "rule", "syncValidation"]);
    expect(versions).toEqual([1]);
    expect(form.getState().version).toBe(1);
  });

  test("state rules toggle visibility without writing values", () => {
    const { model, environment } = compileRules({
      rules: [
        {
          kind: "state",
          target: "region",
          action: { visible: { eq: [{ field: "country" }, "CN"] } },
        },
      ],
    });
    const form = createForm(model, { environment, initialValues: sampleProducts() });
    expect(form.getField("region").getState().visible).toBe(true);
    form.setValue("country", "US");
    expect(form.getField("region").getState().visible).toBe(false);
    expect(form.getValue("region")).toBe("east");
    form.setValue("country", "CN");
    expect(form.getField("region").getState().visible).toBe(true);
    expect(form.getValue("region")).toBe("east");
  });

  test("disabled and readonly do not rewrite values and computed stays hard-readonly", () => {
    const { model, environment } = compileRules({
      rules: [
        { kind: "state", target: "region", action: { disabled: true, readonly: true } },
        { kind: "computed", target: "total", action: { value: { field: "amount" } } },
      ],
    });
    const form = createForm(model, { environment, initialValues: sampleProducts() });
    expect(form.getField("region").getState().disabled).toBe(true);
    expect(form.getField("region").getState().readonly).toBe(true);
    expect(form.getField("total").getState().readonly).toBe(true);
    form.setValue("region", "west");
    expect(form.getValue("region")).toBe("west");
    form.setValue("total", 999);
    expect(form.getValue("total")).toBe(10);
    expect(form.getField("total").getState()).not.toHaveProperty("valueCopy");
  });

  test("chained computed values stabilize in one commit", () => {
    const { model, environment } = compileRules({
      rules: [
        { kind: "computed", target: "subtotal", action: { value: { field: "amount" } } },
        { kind: "computed", target: "total", action: { value: { field: "subtotal" } } },
      ],
    });
    const form = createForm(model, { environment, initialValues: sampleProducts() });
    const seen: string[] = [];
    subscribeRuntime(form, formSelector(), (snapshot) => {
      const values = snapshot.values as { subtotal?: number; total?: number };
      seen.push(`${values.subtotal}:${values.total}:${snapshot.version}`);
    });
    form.setValue("amount", 20);
    expect(form.getValue("subtotal")).toBe(20);
    expect(form.getValue("total")).toBe(20);
    expect(seen).toEqual(["20:20:1"]);
  });

  test("effects enqueue FIFO setValue commands and suppress no-ops", () => {
    const { model, environment } = compileRules({
      rules: [
        {
          kind: "effect",
          target: "country",
          action: {
            actions: [
              { type: "setValue", target: "region", value: "north" },
              { type: "setValue", target: "hidden", value: "from-effect" },
            ],
          },
        },
      ],
    });
    const form = createForm(model, { environment, initialValues: { country: "US", region: "east", hidden: "secret" } });
    expect(form.getValue("region")).toBe("north");
    expect(form.getValue("hidden")).toBe("from-effect");
    expect(form.getState().version).toBe(0);
    form.setValue("country", "CN");
    expect(form.getValue("region")).toBe("north");
    expect(form.getState().version).toBe(1);
  });

  test("oscillating effects roll back the whole transaction", () => {
    const { model, environment } = compileRules({
      rules: [
        {
          kind: "effect",
          action: { actions: [{ type: "setValue", target: "flag", value: { not: { field: "flag" } } }] },
        },
      ],
    });
    expect(() => createForm(model, { environment, initialValues: { flag: true } })).toThrow(FormRuntimeError);
    const looped = compileRules({
      rules: [
        {
          kind: "effect",
          when: { eq: [{ field: "country" }, "loop"] },
          action: { actions: [{ type: "setValue", target: "flag", value: { not: { field: "flag" } } }] },
        },
      ],
    });
    const form = createFormWithTestHooks(
      looped.model,
      { environment: looped.environment, initialValues: { country: "CN", flag: true } },
      { commandLimit: 6, iterationLimit: 6 },
    );
    const before = form.getValues();
    let notified = 0;
    subscribeRuntime(form, formSelector(), () => {
      notified += 1;
    });
    const error = expectRuntimeError(() => form.setValue("country", "loop"));
    expect(error.diagnostics[0]?.code).toBe(RUNTIME_DIAGNOSTIC_CODES.TRANSACTION_LIMIT);
    expect(form.getValues()).toBe(before);
    expect(form.getState().version).toBe(0);
    expect(notified).toBe(0);
  });

  test("hands a validation plan to the owner only after rules stabilize", () => {
    const plans: unknown[] = [];
    const { model, environment } = compileRules({
      rules: [
        { kind: "computed", target: "total", action: { value: { field: "amount" } } },
        {
          kind: "validation",
          target: "total",
          action: { assertion: { gt: [{ field: "total" }, 0] }, failure: { code: "min", message: "needed" } },
        },
      ],
    });
    const form = createFormWithTestHooks(model, { environment, initialValues: sampleProducts() }, {
      validationOwner: (plan) => {
        plans.push(plan);
      },
    });
    form.setValue("amount", 4);
    expect(form.getValue("total")).toBe(4);
    expect(plans.at(-1)).toEqual({ bindings: [{ ruleId: "rule:0001:validation:total", target: "total" }] });
    expect(form.getState()).not.toHaveProperty("valid");
    expect(form).not.toHaveProperty("validate");
  });

  test("stabilizes createForm and reset without publishing a partial instance", () => {
    const { model, environment } = compileRules({
      rules: [
        { kind: "computed", target: "total", action: { value: { field: "amount" } } },
        {
          kind: "effect",
          action: { actions: [{ type: "setValue", target: "region", value: "init" }] },
        },
      ],
    });
    const form = createForm(model, { environment, initialValues: { amount: 3, region: "east", total: 0 } });
    expect(form.getState().version).toBe(0);
    expect(form.getValue("total")).toBe(3);
    expect(form.getValue("region")).toBe("init");
    expect(form.getState().dirty).toBe(false);
    form.setValue("amount", 9);
    expect(form.getState().dirty).toBe(true);
    form.reset();
    expect(form.getValue("amount")).toBe(3);
    expect(form.getValue("total")).toBe(3);
    expect(form.getValue("region")).toBe("init");
    expect(form.getState().dirty).toBe(false);
    expect(form.getState().version).toBe(2);
  });
});
