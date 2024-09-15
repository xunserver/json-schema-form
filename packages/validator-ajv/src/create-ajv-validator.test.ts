import { describe, expect, test } from "vitest";
import { compileForm, createForm, defineForm } from "@form/core";
import { createFormEnvironment, definePlugin } from "@form/core/extension";
import { createAjvValidator, AJV_VALIDATOR_KEY, normalizeAjvErrors } from "./index.js";
import type { ErrorObject } from "ajv";

function environment() {
  const adapter = createAjvValidator();
  return createFormEnvironment({
    plugins: [
      definePlugin({
        id: "ajv",
        dependsOn: ["core"],
        contributes: {
          validators: {
            [AJV_VALIDATOR_KEY]: adapter,
          },
        },
      }),
    ],
  });
}

describe("AJV adapter", () => {
  test("validateAll is synchronous and does not leak the AJV instance into the compiled model", () => {
    const env = environment();
    const result = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: { email: { type: "string", minLength: 3 } },
          required: ["email"],
        },
        config: { schemaValidator: AJV_VALIDATOR_KEY },
      }),
      { environment: env },
    );
    expect(result.model.validation.schema.adapterKey).toBe(AJV_VALIDATOR_KEY);
    expect(JSON.stringify(result.model)).not.toMatch(/Ajv|ajv\.|ErrorObject/);
    const descriptor = env.validators.get(AJV_VALIDATOR_KEY);
    expect(descriptor).not.toHaveProperty("ajv");
    const issues = descriptor && descriptor.kind === "schema-adapter" ? descriptor.validateAll({
      schema: result.model.validation.schema.schema,
      value: {},
    }) : [];
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.every((issue) => Object.isFrozen(issue))).toBe(true);
  });

  test("normalizes required nested escaped array keyword params and schemaPath", () => {
    const required = {
      keyword: "required",
      instancePath: "/profile",
      schemaPath: "#/properties/profile/required",
      params: { missingProperty: "name" },
      message: "must have required property 'name'",
    } as ErrorObject;
    const nested = {
      keyword: "minLength",
      instancePath: "/profile/name",
      schemaPath: "#/properties/profile/properties/name/minLength",
      params: { limit: 1 },
      message: "must NOT have fewer than 1 characters",
    } as ErrorObject;
    const escaped = {
      keyword: "type",
      instancePath: "/profile/a~1b",
      schemaPath: "#/properties/profile/properties/a~1b/type",
      params: { type: "string" },
      message: "must be string",
    } as ErrorObject;
    const item = {
      keyword: "minLength",
      instancePath: "/items/0/sku",
      schemaPath: "#/properties/items/items/properties/sku/minLength",
      params: { limit: 1 },
      message: "must NOT have fewer than 1 characters",
    } as ErrorObject;
    const normalized = normalizeAjvErrors([required, nested, escaped, item]);
    expect(normalized).toEqual([
      expect.objectContaining({
        code: "required",
        keyword: "required",
        instancePath: "/profile",
        params: { missingProperty: "name" },
        schemaPath: "#/properties/profile/required",
      }),
      expect.objectContaining({ instancePath: "/profile/name", keyword: "minLength" }),
      expect.objectContaining({ instancePath: "/profile/a~1b" }),
      expect.objectContaining({ instancePath: "/items/0/sku" }),
    ]);
    expect(Object.isFrozen(normalized[0])).toBe(true);
    expect(JSON.stringify(normalized)).not.toMatch(/ErrorObject/);
  });

  test("schema compile failure stays inside the adapter and does not leak AJV objects", () => {
    const adapter = createAjvValidator();
    expect(() =>
      adapter.validateAll({
        schema: { type: "object", properties: { email: { type: "not-a-type" } } },
        value: {},
      }),
    ).toThrow();
    try {
      adapter.validateAll({
        schema: { type: "object", properties: { email: { type: "not-a-type" } } },
        value: {},
      });
    } catch (error) {
      expect(JSON.stringify(error, Object.getOwnPropertyNames(error as object))).not.toMatch(/ajv\.|ValidateFunction/);
    }
  });

  test("maps required missingProperty onto the child field through Core", async () => {
    const env = environment();
    const { model } = compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            profile: {
              type: "object",
              properties: { name: { type: "string" } },
              required: ["name"],
            },
          },
        },
        config: { schemaValidator: AJV_VALIDATOR_KEY, validateOn: "change" },
      }),
      { environment: env },
    );
    const form = createForm(model, { environment: env, initialValues: { profile: {} } });
    form.setValue("profile", {});
    const result = await form.validate();
    expect(result.valid).toBe(false);
    expect(form.getField("profile.name").getState().errors.some((error) => error.keyword === "required")).toBe(true);
    expect(form.getField("profile").getState().directErrors.some((error) => error.instancePath === "profile.name")).toBe(
      false,
    );
  });
});
