import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "../index.js";
import { createFormEnvironment, definePlugin } from "../extension/index.js";
import { defineRuleFunction } from "../extension/define-rule-function.js";
import { effectiveStateSelector, fieldSelector, subscribeRuntime } from "./index.js";
import { peekFormRuntime } from "./test-harness.js";
import { compileRules, sampleProducts } from "./rules.test-utils.js";

describe("requirement source index", () => {
  test("root array item and sourceless fields are none", () => {
    const root = compileForm(defineForm({ schema: { type: "string" } })).model;
    const list = compileForm(defineForm({ schema: { type: "array", items: { type: "string" } } })).model;
    const object = compileForm(
      defineForm({
        schema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      }),
    ).model;
    const rootForm = createForm(root, { initialValues: "Ada" });
    const listForm = createForm(list, { initialValues: ["a"] });
    const objectForm = createForm(object, { initialValues: { name: "Ada" } });
    expect(peekFormRuntime(rootForm).requirementSource("").kind).toBe("none");
    expect(peekFormRuntime(listForm).requirementSource("[]").kind).toBe("none");
    expect(peekFormRuntime(objectForm).requirementSource("name").kind).toBe("required");
    const nested = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { address: { type: "object", properties: { street: { type: "string" } } } },
        },
      }),
    ).model;
    const nestedForm = createForm(nested, { initialValues: { address: { street: "1" } } });
    expect(peekFormRuntime(nestedForm).requirementSource("address").kind).toBe("none");
    expect(peekFormRuntime(nestedForm).requirementSource("address.street").kind).toBe("optional");
  });
});

describe("effective required", () => {
  test("static required and optional are independent of visible disabled readonly", () => {
    const { model, environment } = compileRules({
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          nickname: { type: "string" },
          hidden: { type: "string" },
        },
        required: ["name"],
      },
      uiSchema: {
        fields: {
          name: { behavior: { visible: false, disabled: true, readonly: true } },
        },
      },
    });
    const form = createForm(model, { environment, initialValues: { name: "Ada", nickname: "A", hidden: "h" } });
    expect(form.getField("name").getState()).toMatchObject({ required: true, visible: false, disabled: true, readonly: true });
    expect(form.getField("nickname").getState().required).toBe(false);
  });

  test("conditional required flips in the same commit and inactive fields report false", () => {
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { type: { type: "string" } },
          if: { properties: { type: { const: "company" } }, required: ["type"] },
          then: { properties: { companyName: { type: "string" } }, required: ["companyName"] },
          else: { properties: { personalName: { type: "string" } } },
        },
      }),
    );
    const form = createForm(model, {
      initialValues: { type: "person", companyName: "Acme", personalName: "Ada" },
    });
    form.touch("companyName");
    expect(form.getField("companyName").getState()).toMatchObject({ active: false, required: false, touched: true });
    const versions: number[] = [];
    subscribeRuntime(form, fieldSelector("companyName"), (snapshot) => {
      versions.push(form.getState().version);
      void snapshot;
    });
    form.setValue("type", "company");
    expect(form.getField("companyName").getState()).toMatchObject({
      active: true,
      required: true,
      value: "Acme",
      touched: true,
    });
    expect(new Set(versions).size).toBe(1);
    form.setValue("type", "person");
    expect(form.getField("companyName").getState()).toMatchObject({
      active: false,
      required: false,
      value: "Acme",
      touched: true,
    });
  });

  test("only activation-affected selectors re-evaluate required", () => {
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { type: { type: "string" }, nickname: { type: "string" } },
          if: { properties: { type: { const: "company" } }, required: ["type"] },
          then: { properties: { companyName: { type: "string" } }, required: ["companyName"] },
        },
      }),
    );
    const form = createForm(model, {
      initialValues: { type: "person", nickname: "n", companyName: "Acme" },
    });
    let companyRuns = 0;
    let nicknameRuns = 0;
    subscribeRuntime(form, effectiveStateSelector("companyName"), () => {
      companyRuns += 1;
    });
    subscribeRuntime(form, effectiveStateSelector("nickname"), () => {
      nicknameRuns += 1;
    });
    form.setValue("type", "company");
    expect(form.getField("companyName").getState().required).toBe(true);
    expect(companyRuns).toBe(1);
    expect(nicknameRuns).toBe(0);
  });

  test("widget props native rules and injected validation cannot change required", () => {
    const environment = createFormEnvironment({
      plugins: [
        definePlugin({
          id: "probe",
          dependsOn: ["core"],
          contributes: {
            ruleFunctions: {
              "probe.flag": defineRuleFunction({
                name: "probe.flag",
                evaluate: () => true,
              }),
            },
          },
        }),
      ],
    });
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { name: { type: "string" }, nickname: { type: "string" } },
          required: ["name"],
        },
        uiSchema: {
          fields: {
            name: { behavior: { visible: false } },
          },
        },
        rules: [{ kind: "state", target: "name", action: { visible: { call: "probe.flag", args: [] } } }],
      }),
      { environment },
    );
    const form = createForm(model, { environment, initialValues: { name: "Ada", nickname: "n" } });
    expect(form.getField("name").getState().required).toBe(true);
    expect(form.getField("nickname").getState().required).toBe(false);
    expect(form.getField("name").getState()).not.toHaveProperty("errors");
    void sampleProducts;
  });
});
