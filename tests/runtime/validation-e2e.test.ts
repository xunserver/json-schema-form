import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "@form/core";
import { createFormEnvironment, definePlugin, defineValidator } from "@form/core/extension";
import { AJV_VALIDATOR_KEY, createAjvValidator } from "@form/validator-ajv";

function environment() {
  return createFormEnvironment({
    plugins: [
      definePlugin({
        id: "company",
        dependsOn: ["core"],
        contributes: {
          validators: {
            [AJV_VALIDATOR_KEY]: createAjvValidator(),
            "company.format": defineValidator({
              name: "company.format",
              kind: "sync",
              validate: (context) =>
                typeof context.target === "string" && context.target.includes("@") ? [] : [{ code: "format" }],
            }),
            "company.unique": defineValidator({
              name: "company.unique",
              kind: "async",
              validate: async (context) => (context.target === "taken@x.com" ? [{ code: "unique" }] : []),
            }),
          },
        },
      }),
    ],
  });
}

describe("validation integration", () => {
  test("schema sync async and server aggregate through validate and submit", async () => {
    const env = environment();
    const compiled = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            email: { type: "string", minLength: 3 },
            items: {
              type: "array",
              items: { type: "object", properties: { sku: { type: "string", minLength: 1 } } },
            },
          },
          required: ["email"],
        },
        rules: [
          {
            kind: "validation",
            target: "email",
            action: { assertion: true, failure: { code: "rule", message: "ok" } },
          },
        ],
        config: {
          schemaValidator: AJV_VALIDATOR_KEY,
          validators: [
            { validator: "company.format", target: "email", dependencies: [] },
            { validator: "company.unique", target: "email", dependencies: [] },
          ],
        },
      }),
      { environment: env },
    );
    const form = createForm(compiled.model, {
      environment: env,
      initialValues: {
        email: "ab",
        items: [{ sku: "s" }, { sku: "t" }],
      },
    });
    const invalid = await form.submit(async () => undefined);
    expect(invalid.submitted).toBe(false);
    expect(invalid.valid).toBe(false);
    form.setValue("email", "ok@x.com");
    form.applyErrors([{ code: "remote", instancePath: "email" }]);
    expect(form.getState().errors.some((error) => error.source === "server")).toBe(true);
    form.applyErrors([]);
    form.array("items").move(0, 1);
    form.array("items").remove(0);
    const result = await form.validate();
    expect(result.superseded).toBe(false);
    const valid = await form.submit(async (payload) => {
      expect(payload).toMatchObject({ email: "ok@x.com" });
    });
    expect(valid.submitted).toBe(true);
  });
});
