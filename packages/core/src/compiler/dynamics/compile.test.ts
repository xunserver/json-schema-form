import { describe, expect, test } from "vitest";
import { compileForm } from "../compile-form.js";
import { CompileError } from "../../model/compile-error.js";
import { COMPILER_DIAGNOSTIC_CODES } from "../../model/diagnostic-codes.js";
import { defineForm } from "../../definition/define-form.js";

const SKIP_KIND_WIDGET = {
  fields: {
    kind: { field: false as const },
  },
};

describe("Schema Dynamics compiler", () => {
  test("compiles discriminated oneOf/anyOf without instance active on DataModel", () => {
    const result = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { kind: { type: "string" } },
          oneOf: [
            {
              properties: { kind: { const: "company" }, company: { type: "string" } },
              required: ["kind"],
            },
            {
              properties: { kind: { const: "person" }, person: { type: "string" } },
              required: ["kind"],
            },
          ],
        },
        uiSchema: SKIP_KIND_WIDGET,
      }),
    );
    expect(result.model.schemaDynamics.plans.some((plan) => plan.kind === "oneOf")).toBe(true);
    expect(result.model).not.toHaveProperty("active");
    const plan = result.model.schemaDynamics.plans.find((item) => item.kind === "oneOf");
    expect(plan?.branches).toHaveLength(2);
    expect(plan?.branches[0]?.schemaPath).toContain("oneOf");
    expect(plan?.branches[0]?.exclusiveNodes).toEqual(["company"]);
    expect(plan?.branches[1]?.exclusiveNodes).toEqual(["person"]);
    expect(plan?.branches[0]?.sharedNodes).toEqual(expect.arrayContaining(["kind"]));
    const again = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { kind: { type: "string" } },
          oneOf: [
            {
              properties: { kind: { const: "company" }, company: { type: "string" } },
              required: ["kind"],
            },
            {
              properties: { kind: { const: "person" }, person: { type: "string" } },
              required: ["kind"],
            },
          ],
        },
        uiSchema: SKIP_KIND_WIDGET,
      }),
    );
    expect(again.model.schemaDynamics.plans).toEqual(result.model.schemaDynamics.plans);
    expect([...again.model.schemaDynamics.byPath.entries()]).toEqual([...result.model.schemaDynamics.byPath.entries()]);
  });

  test("compiles if/then/else and dependentSchemas with property presence", () => {
    const result = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { kind: { type: "string" }, creditCard: { type: "string" } },
          if: { properties: { kind: { const: "company" } }, required: ["kind"] },
          then: { properties: { companyName: { type: "string" } } },
          else: { properties: { personalName: { type: "string" } } },
          dependentSchemas: {
            creditCard: { properties: { billing: { type: "string" } } },
          },
        },
      }),
    );
    const ifPlan = result.model.schemaDynamics.plans.find((plan) => plan.kind === "if");
    expect(ifPlan?.branches.map((branch) => branch.id)).toEqual([
      "if:root:then",
      "if:root:else",
    ]);
    const dependent = result.model.schemaDynamics.plans.find((plan) => plan.kind === "dependentSchemas");
    expect(dependent?.branches[0]?.predicate).toEqual({ type: "present", path: "", property: "creditCard" });
  });

  test("compiles anyOf with multiple matching candidates", () => {
    const result = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { kind: { type: "string" } },
          anyOf: [
            { properties: { kind: { const: "a" }, left: { type: "string" } }, required: ["kind"] },
            { properties: { kind: { const: "b" }, right: { type: "string" } }, required: ["kind"] },
          ],
        },
        uiSchema: SKIP_KIND_WIDGET,
      }),
    );
    const plan = result.model.schemaDynamics.plans.find((item) => item.kind === "anyOf");
    expect(plan?.branches).toHaveLength(2);
    expect(plan?.branches[0]?.exclusiveNodes).toEqual(["left"]);
    expect(plan?.branches[1]?.exclusiveNodes).toEqual(["right"]);
  });

  test("rejects oneOf without a discriminator instead of guessing a branch", () => {
    try {
      compileForm(
        defineForm({
          schema: {
            type: "object",
            oneOf: [{}, { properties: { extra: { type: "string" } } }],
          },
        }),
      );
      throw new Error("expected CompileError");
    } catch (error) {
      expect(error).toBeInstanceOf(CompileError);
      expect((error as CompileError).diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.DYNAMICS_AMBIGUOUS);
      expect((error as CompileError).diagnostics[0]?.schemaPath).toBeDefined();
    }
  });

  test("fails unsupported predicates instead of guessing", () => {
    try {
      compileForm(
        defineForm({
          schema: {
            type: "object",
            if: { minimum: 1 },
            then: { properties: { extra: { type: "string" } } },
          },
        }),
      );
      throw new Error("expected CompileError");
    } catch (error) {
      expect(error).toBeInstanceOf(CompileError);
      expect((error as CompileError).diagnostics[0]?.code).toBe(COMPILER_DIAGNOSTIC_CODES.DYNAMICS_UNSUPPORTED);
      expect((error as CompileError).diagnostics[0]?.schemaPath).toBeDefined();
    }
  });
});
