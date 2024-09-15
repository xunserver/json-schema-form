import { describe, expect, test, vi } from "vitest";
import { compileForm, createForm, defineForm, FormRuntimeError } from "../../index.js";
import { createFormEnvironment, definePlugin, defineValidator } from "../../extension/index.js";
import { RUNTIME_DIAGNOSTIC_CODES } from "../diagnostic-codes.js";
import type { FieldView, ViewNode } from "../../model/ui/ui.js";
import {
  fieldSelector,
  formSelector,
  getRuntimeSnapshot,
  observeRuntimeDiagnostics,
  presentableErrorSelector,
  subscribeRuntime,
} from "../index.js";
import type { FormConfig, ValidatorUse } from "../../definition/form-config.js";
import type { ValidatorDefinition } from "../../extension/contributions.js";

const schema = {
  type: "object" as const,
  properties: {
    email: { type: "string" as const },
    name: { type: "string" as const },
    amount: { type: "number" as const },
    total: { type: "number" as const },
    profile: {
      type: "object" as const,
      properties: { name: { type: "string" as const } },
    },
    items: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: { sku: { type: "string" as const } },
      },
    },
    kind: { type: "string" as const },
    company: { type: "string" as const },
    person: { type: "string" as const },
  },
  required: ["email"],
};

function collectFieldViews(node: ViewNode): FieldView[] {
  const views: FieldView[] = [];
  if (node.kind === "field") {
    views.push(node);
  }
  if ("children" in node) {
    for (const child of node.children) {
      views.push(...collectFieldViews(child));
    }
  }
  if ("itemLayout" in node) {
    for (const child of node.itemLayout) {
      views.push(...collectFieldViews(child));
    }
  }
  return views;
}

function dummySchemaAdapter() {
  return defineValidator({
    name: "ajv-2020",
    kind: "schema-adapter",
    validateAll: () => [],
  });
}

function compileWith(
  validators: Record<string, ValidatorDefinition>,
  config?: FormConfig,
  extra?: { schema?: object; rules?: object[]; uiSchema?: object },
) {
  const hasSchemaAdapter = Object.values(validators).some((item) => item.kind === "schema-adapter");
  const allValidators = hasSchemaAdapter ? validators : { "ajv-2020": dummySchemaAdapter(), ...validators };
  const environment = createFormEnvironment({
    plugins: [
      definePlugin({
        id: "company",
        dependsOn: ["core"],
        contributes: { validators: allValidators },
      }),
    ],
  });
  const formConfig: FormConfig = {
    ...(hasSchemaAdapter ? {} : { schemaValidator: "ajv-2020" }),
    ...(config ?? {}),
  };
  const { model } = compileForm(
    defineForm({
      schema: (extra?.schema ?? schema) as never,
      config: formConfig,
      ...(extra?.rules === undefined ? {} : { rules: extra.rules as never }),
      ...(extra?.uiSchema === undefined ? {} : { uiSchema: extra.uiSchema as never }),
    }),
    { environment },
  );
  return { model, environment };
}

describe("validation pipeline", () => {
  test("aggregates four sources and keeps child errors off the parent direct list", async () => {
    const { model, environment } = compileWith(
      {
        "ajv-2020": defineValidator({
          name: "ajv-2020",
          kind: "schema-adapter",
          validateAll: ({ value }) => {
            const record = value as { email?: string };
            if (record.email) {
              return [];
            }
            return [{ code: "required", keyword: "required", instancePath: "", params: { missingProperty: "email" } }];
          },
        }),
        "company.sync": defineValidator({
          name: "company.sync",
          kind: "sync",
          validate: (context) => (context.target === "Ada" ? [] : [{ code: "name" }]),
        }),
        "company.async": defineValidator({
          name: "company.async",
          kind: "async",
          validate: async (context) => (context.target === "ok" ? [] : [{ code: "unique" }]),
        }),
      },
      {
        schemaValidator: "ajv-2020",
        validateOn: "change",
        validators: [
          { validator: "company.sync", target: "name", dependencies: [], trigger: "change" },
          { validator: "company.async", target: "email", dependencies: [], trigger: "change" },
        ],
      },
    );
    const form = createForm(model, { environment, initialValues: { name: "x", email: "", profile: {} } });
    form.setValue("name", "x");
    const result = await form.validate();
    expect(result.valid).toBe(false);
    form.applyErrors([{ code: "remote", instancePath: "profile.name", message: "taken" }]);
    const name = form.getField("name").getState();
    const profile = form.getField("profile").getState();
    const child = form.getField("profile.name").getState();
    const root = form.getState();
    expect(name.directErrors.some((error) => error.source === "custom")).toBe(true);
    expect(child.directErrors.some((error) => error.source === "server")).toBe(true);
    expect(profile.directErrors.some((error) => error.instancePath === "profile.name")).toBe(false);
    expect(profile.errors.some((error) => error.source === "server")).toBe(true);
    expect(root.errors.map((error) => error.source).sort()).toEqual(["async", "custom", "schema", "server"]);
  });

  test("owners stay partitioned across schema custom async rule and server", async () => {
    const { model, environment } = compileWith(
      {
        "company.sync": defineValidator({
          name: "company.sync",
          kind: "sync",
          validate: () => [{ code: "custom" }],
        }),
      },
      {
        validateOn: "change",
        validators: [{ validator: "company.sync", target: "name", dependencies: [], trigger: "change" }],
      },
      {
        rules: [
          {
            kind: "validation",
            target: "email",
            action: { assertion: { gt: [{ field: "amount" }, 0] }, failure: { code: "rule", message: "need" } },
          },
        ],
      },
    );
    const form = createForm(model, { environment, initialValues: { name: "a", email: "e", amount: 0 } });
    form.setValue("amount", 0);
    await form.validate();
    form.applyErrors([{ code: "server", instancePath: "email" }]);
    const email = form.getField("email").getState();
    expect(email.errors.some((error) => error.source === "custom" && error.code === "rule")).toBe(true);
    expect(email.errors.some((error) => error.source === "server")).toBe(true);
    expect(form.getField("name").getState().errors.some((error) => error.source === "custom")).toBe(true);
    form.applyErrors([]);
    expect(form.getField("email").getState().errors.some((error) => error.source === "server")).toBe(false);
    expect(form.getField("email").getState().errors.some((error) => error.code === "rule")).toBe(true);
    expect(form.getField("name").getState().errors.some((error) => error.code === "custom")).toBe(true);
  });

  test("equivalent owner replacement keeps error identity", () => {
    const { model, environment } = compileWith(
      {
        "company.sync": defineValidator({
          name: "company.sync",
          kind: "sync",
          validate: () => [{ code: "name" }],
        }),
      },
      {
        validateOn: "change",
        validators: [{ validator: "company.sync", target: "name", dependencies: [], trigger: "change" }],
      },
    );
    const form = createForm(model, { environment, initialValues: { name: "a" } });
    form.setValue("name", "b");
    const first = form.getField("name").getState().directErrors;
    form.setValue("name", "c");
    const second = form.getField("name").getState().directErrors;
    expect(second[0]?.id).toBe(first[0]?.id);
    expect(second).toBe(first);
  });

  test("hidden active fields still validate and presentation does not change valid", () => {
    const { model, environment } = compileWith(
      {
        "company.sync": defineValidator({
          name: "company.sync",
          kind: "sync",
          validate: () => [{ code: "hidden" }],
        }),
      },
      {
        validateOn: "change",
        errorPresentation: "submitted",
        validators: [{ validator: "company.sync", target: "name", dependencies: [], trigger: "change" }],
      },
      {
        uiSchema: { fields: { name: { behavior: { visible: false, disabled: true, readonly: true } } } },
      },
    );
    const form = createForm(model, { environment, initialValues: { name: "Ada" } });
    form.setValue("name", "Bob");
    const field = form.getField("name").getState();
    expect(field.visible).toBe(false);
    expect(field.disabled).toBe(true);
    expect(field.valid).toBe(false);
    expect(field.errors).toHaveLength(1);
    expect(form.getState().valid).toBe(false);
    const presented = subscribeRuntime;
    void presented;
    const presentable = form.getField("name").getState().errors;
    expect(presentable.length).toBe(1);
    const raw = field.errors;
    form.touch("email");
    expect(form.getField("name").getState().errors).toBe(raw);
    expect(form.getField("name").getState().valid).toBe(false);
    void presentableErrorSelector("name");
  });

  test("applyErrors is atomic, clones input, and clears on exact value change", () => {
    const { model, environment } = compileWith({});
    const form = createForm(model, { environment, initialValues: { email: "a", name: "n", profile: { name: "p" } } });
    const input = [{ code: "remote", instancePath: "email", params: { n: 1 } }];
    expect(() =>
      form.applyErrors([
        { code: "ok", instancePath: "email" },
        { code: "bad", instancePath: "items[9].sku" },
      ]),
    ).toThrow(FormRuntimeError);
    expect(form.getState().errors).toEqual([]);
    form.applyErrors(input);
    expect(form.getField("email").getState().directErrors[0]?.source).toBe("server");
    input[0]!.code = "mutated";
    (input[0]!.params as { n: number }).n = 9;
    expect(form.getField("email").getState().directErrors[0]?.code).toBe("remote");
    expect(form.getField("email").getState().directErrors[0]?.params).toEqual({ n: 1 });
    form.setValue("name", "other");
    expect(form.getField("email").getState().directErrors).toHaveLength(1);
    form.applyErrors([{ code: "parent", instancePath: "profile" }]);
    form.setValue("profile.name", "q");
    expect(form.getField("profile").getState().directErrors.some((error) => error.code === "parent")).toBe(true);
    form.setValue("email", "b");
    expect(form.getField("email").getState().directErrors).toHaveLength(0);
    form.applyErrors([]);
    expect(form.getState().errors).toEqual([]);
  });

  test("array move keeps identity and remove drops pending owners", async () => {
    let release!: (value: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    const { model, environment } = compileWith(
      {
        "company.async": defineValidator({
          name: "company.async",
          kind: "async",
          validate: async () => {
            await gate;
            return [{ code: "late" }];
          },
        }),
      },
      {
        validateOn: "change",
        validators: [{ validator: "company.async", target: "items[].sku", dependencies: [], trigger: "change" }],
      },
    );
    const form = createForm(model, {
      environment,
      initialValues: { items: [{ sku: "a" }, { sku: "b" }] },
    });
    form.setValue("items[0].sku", "aa");
    form.applyErrors([{ code: "server", instancePath: "items[0].sku" }]);
    const firstId = form.array("items").items()[0]!.id;
    form.array("items").move(0, 1);
    expect(form.array("items").item(firstId).getField("sku").getState().directErrors[0]?.source).toBe("server");
    expect(form.getField("items[1].sku").getState().directErrors[0]?.source).toBe("server");
    const removed = form.array("items").item(1);
    form.array("items").remove(1);
    release("done");
    await Promise.resolve();
    await Promise.resolve();
    expect(() => removed.getField("sku")).toThrow(FormRuntimeError);
    expect(form.getState().errors.some((error) => error.code === "late")).toBe(false);
  });

  test("reset clears validation and submit lifecycle", async () => {
    const { model, environment } = compileWith(
      {
        "company.sync": defineValidator({
          name: "company.sync",
          kind: "sync",
          validate: () => [{ code: "nope" }],
        }),
      },
      {
        validators: [{ validator: "company.sync", target: "name", dependencies: [] }],
      },
    );
    const form = createForm(model, { environment, initialValues: { name: "Ada" } });
    await form.submit(async () => undefined);
    expect(form.getState().submitCount).toBe(1);
    expect(form.getState().valid).toBe(false);
    form.reset();
    expect(form.getState()).toMatchObject({
      submitCount: 0,
      submitting: false,
      valid: true,
      validating: false,
      errors: [],
    });
  });

  test("async latest-wins and validate waits", async () => {
    let release!: (value: string) => void;
    const first = new Promise<string>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const { model, environment } = compileWith(
      {
        "company.async": defineValidator({
          name: "company.async",
          kind: "async",
          validate: async (context) => {
            calls += 1;
            if (calls === 1) {
              await first;
              return [{ code: "stale" }];
            }
            return context.target === "ok" ? [] : [{ code: "latest" }];
          },
        }),
      },
      {
        validateOn: "change",
        validators: [{ validator: "company.async", target: "email", dependencies: [], trigger: "change" }],
      },
    );
    const form = createForm(model, { environment, initialValues: { email: "one" } });
    form.setValue("email", "two");
    const pending = form.getField("email").getState();
    expect(pending.validating).toBe(true);
    expect(pending.valid).toBe(true);
    form.setValue("email", "ok");
    release("done");
    const result = await form.validate();
    expect(result.valid).toBe(true);
    expect(result.superseded).toBe(false);
    expect(form.getField("email").getState().errors.some((error) => error.code === "stale")).toBe(false);
    expect(form.getField("email").getState().validating).toBe(false);
  });

  test("two form instances isolate async generations", async () => {
    const { model, environment } = compileWith(
      {
        "company.async": defineValidator({
          name: "company.async",
          kind: "async",
          validate: async (context) => [{ code: String(context.target) }],
        }),
      },
      {
        validateOn: "change",
        validators: [{ validator: "company.async", target: "email", dependencies: [], trigger: "change" }],
      },
    );
    const left = createForm(model, { environment, initialValues: { email: "a" } });
    const right = createForm(model, { environment, initialValues: { email: "b" } });
    left.setValue("email", "L");
    right.setValue("email", "R");
    await left.validate();
    await right.validate();
    expect(left.getField("email").getState().errors[0]?.code).toBe("L");
    expect(right.getField("email").getState().errors[0]?.code).toBe("R");
  });

  test("async rejection emits operational diagnostic without a business error", async () => {
    const { model, environment } = compileWith(
      {
        "company.async": defineValidator({
          name: "company.async",
          kind: "async",
          validate: async () => {
            throw new Error("secret-stack");
          },
        }),
      },
      {
        validateOn: "change",
        validators: [{ validator: "company.async", target: "email", dependencies: [], trigger: "change" }],
      },
    );
    const form = createForm(model, { environment, initialValues: { email: "a" } });
    const codes: string[] = [];
    observeRuntimeDiagnostics(form, (event) => {
      codes.push(...event.diagnostics.map((item) => item.code));
      expect(JSON.stringify(event.diagnostics)).not.toMatch(/secret-stack/);
    });
    form.setValue("email", "b");
    await form.validate();
    expect(codes).toContain(RUNTIME_DIAGNOSTIC_CODES.VALIDATOR_FAILED);
    expect(form.getField("email").getState().errors).toEqual([]);
    expect(form.getField("email").getState().validating).toBe(false);
  });

  test("validate follows supersession when values change while waiting", async () => {
    let release!: (value: string) => void;
    const gate = new Promise<string>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const { model, environment } = compileWith(
      {
        "company.async": defineValidator({
          name: "company.async",
          kind: "async",
          validate: async (context) => {
            calls += 1;
            if (calls === 1) {
              await gate;
            }
            return context.target === "ok" ? [] : [{ code: "nope" }];
          },
        }),
      },
      {
        validators: [{ validator: "company.async", target: "email", dependencies: [] }],
      },
    );
    const form = createForm(model, { environment, initialValues: { email: "old" } });
    const first = form.validate();
    form.setValue("email", "ok");
    release("go");
    const superseded = await first;
    expect(superseded.superseded).toBe(true);
    expect(superseded.valid).toBe(false);
    const latest = await form.validate();
    expect(latest.superseded).toBe(false);
    expect(latest.valid).toBe(true);
  });

  test("invalid submit does not call the handler", async () => {
    const { model, environment } = compileWith(
      {
        "company.sync": defineValidator({
          name: "company.sync",
          kind: "sync",
          validate: () => [{ code: "nope" }],
        }),
      },
      {
        validators: [{ validator: "company.sync", target: "name", dependencies: [] }],
      },
    );
    const form = createForm(model, { environment, initialValues: { name: "Ada" } });
    const handler = vi.fn();
    const result = await form.submit(handler);
    expect(result.valid).toBe(false);
    expect(result.submitted).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(form.getState().submitting).toBe(false);
    expect(form.getState().submitCount).toBe(1);
  });

  test("valid submit serializes the validated snapshot and overlapping submits keep submitting", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { model, environment } = compileWith(
      {
        "ajv-2020": defineValidator({
          name: "ajv-2020",
          kind: "schema-adapter",
          validateAll: () => [],
        }),
      },
      { schemaValidator: "ajv-2020" },
    );
    const form = createForm(model, { environment, initialValues: { name: "Ada", email: "a@b.c" } });
    const first = form.submit(async (payload) => {
      expect(payload).toEqual({ name: "Ada", email: "a@b.c" });
      await hold;
    });
    expect(form.getState().submitting).toBe(true);
    const second = form.submit(async () => undefined);
    expect(form.getState().submitting).toBe(true);
    expect(form.getState().submitCount).toBe(2);
    release();
    await first;
    const secondResult = await second;
    expect(secondResult.submitted).toBe(true);
    expect(form.getState().submitting).toBe(false);
  });

  test("handler throw is rethrown after submitting is cleared", async () => {
    const { model, environment } = compileWith(
      {
        "ajv-2020": defineValidator({
          name: "ajv-2020",
          kind: "schema-adapter",
          validateAll: () => [],
        }),
      },
      { schemaValidator: "ajv-2020" },
    );
    const form = createForm(model, { environment, initialValues: { email: "a" } });
    const boom = new Error("business");
    await expect(
      form.submit(() => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(form.getState().submitting).toBe(false);
    expect(form.getState().errors).toEqual([]);
  });

  test("sibling error subscriptions stay isolated", async () => {
    const uses: ValidatorUse[] = [
      { validator: "company.async", target: "email", dependencies: [], trigger: "change" },
      { validator: "company.async", target: "name", dependencies: [], trigger: "change" },
    ];
    const { model, environment } = compileWith(
      {
        "company.async": defineValidator({
          name: "company.async",
          kind: "async",
          validate: async (context) => (String(context.path) === "email" ? [{ code: "email" }] : []),
        }),
      },
      { validateOn: "change", validators: uses },
    );
    const form = createForm(model, { environment, initialValues: { email: "a", name: "n" } });
    let emailRuns = 0;
    let nameRuns = 0;
    subscribeRuntime(form, fieldSelector("email"), () => {
      emailRuns += 1;
    });
    subscribeRuntime(form, fieldSelector("name"), () => {
      nameRuns += 1;
    });
    subscribeRuntime(form, formSelector(), () => undefined);
    emailRuns = 0;
    nameRuns = 0;
    form.setValue("email", "b");
    while (form.getField("email").getState().validating) {
      await Promise.resolve();
    }
    expect(emailRuns).toBeGreaterThan(0);
    expect(nameRuns).toBe(0);
  });

  test("adapter mapping failure rolls back and does not leak values", () => {
    const { model, environment } = compileWith(
      {
        "ajv-2020": defineValidator({
          name: "ajv-2020",
          kind: "schema-adapter",
          validateAll: () => [{ code: "bad", instancePath: "/not-a-field" }],
        }),
      },
      { schemaValidator: "ajv-2020", validateOn: "change" },
    );
    const form = createForm(model, { environment, initialValues: { email: "a" } });
    const version = form.getState().version;
    let thrown: unknown;
    try {
      form.setValue("email", "b");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FormRuntimeError);
    const error = thrown as FormRuntimeError;
    expect(error.diagnostics[0]?.source).toBe("adapter");
    expect(JSON.stringify(error.diagnostics)).not.toMatch(/not-a-field-secret|ErrorObject/);
    expect(form.getValue("email")).toBe("a");
    expect(form.getState().version).toBe(version);
  });

  test("undeclared incremental capabilities always fall back to validateAll", () => {
    const calls = { all: 0, at: 0, affected: 0 };
    const { model, environment } = compileWith(
      {
        "ajv-2020": defineValidator({
          name: "ajv-2020",
          kind: "schema-adapter",
          validateAll: () => {
            calls.all += 1;
            return [];
          },
          validateAt: () => {
            calls.at += 1;
            return [];
          },
          validateAffected: () => {
            calls.affected += 1;
            return [];
          },
        }),
      },
      { schemaValidator: "ajv-2020", validateOn: "change" },
    );
    const form = createForm(model, { environment, initialValues: { email: "a" } });
    form.setValue("email", "b");
    expect(calls.all).toBeGreaterThan(0);
    expect(calls.at).toBe(0);
    expect(calls.affected).toBe(0);
  });

  test("declared validateAffected is used on change and validateAll on manual", async () => {
    const calls = { all: 0, affected: 0 };
    const { model, environment } = compileWith(
      {
        "ajv-2020": defineValidator({
          name: "ajv-2020",
          kind: "schema-adapter",
          capabilities: { validateAffected: true },
          validateAll: () => {
            calls.all += 1;
            return [];
          },
          validateAffected: () => {
            calls.affected += 1;
            return [];
          },
        }),
      },
      { schemaValidator: "ajv-2020", validateOn: "change" },
    );
    const form = createForm(model, { environment, initialValues: { email: "a" } });
    form.setValue("email", "b");
    expect(calls.affected).toBeGreaterThan(0);
    const affected = calls.affected;
    await form.validate();
    expect(calls.all).toBeGreaterThan(0);
    expect(calls.affected).toBe(affected);
  });

  test("blur trigger uses recorded field bindings and validate ignores automatic trigger", async () => {
    let runs = 0;
    const { model, environment } = compileWith(
      {
        "company.sync": defineValidator({
          name: "company.sync",
          kind: "sync",
          validate: () => {
            runs += 1;
            return [{ code: "blur" }];
          },
        }),
      },
      {
        validateOn: "blur",
        validators: [{ validator: "company.sync", target: "name", dependencies: [], trigger: "blur" }],
      },
    );
    const form = createForm(model, { environment, initialValues: { name: "Ada" } });
    const view = collectFieldViews(model.ui.viewTree).find((item) => item.fieldPath === "name");
    expect(view).toBeDefined();
    form.setValue("name", "Grace");
    expect(runs).toBe(0);
    form.focus(view!.id);
    form.blur(view!.id);
    expect(runs).toBe(1);
    runs = 0;
    await form.validate();
    expect(runs).toBeGreaterThan(0);
  });

  test("sync validators observe the post-rule stable draft once", () => {
    const seen: unknown[] = [];
    const { model, environment } = compileWith(
      {
        "company.sync": defineValidator({
          name: "company.sync",
          kind: "sync",
          validate: (context) => {
            seen.push(context.target);
            return [];
          },
        }),
      },
      {
        validateOn: "change",
        validators: [{ validator: "company.sync", target: "total", dependencies: ["amount"], trigger: "change" }],
      },
      {
        rules: [{ kind: "computed", target: "total", action: { value: { field: "amount" } } }],
      },
    );
    const form = createForm(model, { environment, initialValues: { amount: 1, total: 1 } });
    form.setValue("amount", 4);
    expect(form.getValue("total")).toBe(4);
    expect(seen.at(-1)).toBe(4);
    expect(seen.filter((value) => value === 4)).toHaveLength(1);
  });

  test("inactive oneOf branch is excluded and does not revive stale errors", () => {
    const { model, environment } = compileWith(
      {
        "company.sync": defineValidator({
          name: "company.sync",
          kind: "sync",
          validate: () => [{ code: "company" }],
        }),
      },
      {
        validateOn: "change",
        validators: [{ validator: "company.sync", target: "company", dependencies: [], trigger: "change" }],
      },
      {
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
      },
    );
    const form = createForm(model, { environment, initialValues: { kind: "company", company: "Acme", person: "Ada" } });
    form.setValue("company", "Beta");
    expect(form.getField("company").getState().errors.some((error) => error.code === "company")).toBe(true);
    form.setValue("kind", "person");
    expect(form.getField("company").getState().active).toBe(false);
    expect(form.getField("company").getState().errors).toEqual([]);
    form.setValue("kind", "company");
    expect(form.getField("company").getValue()).toBe("Beta");
    expect(form.getField("company").getState().errors.some((error) => error.code === "company")).toBe(true);
  });

  test("throwing error subscriber does not block siblings", () => {
    const { model, environment } = compileWith(
      {
        "company.sync": defineValidator({
          name: "company.sync",
          kind: "sync",
          validate: () => [{ code: "name" }],
        }),
      },
      {
        validateOn: "change",
        validators: [{ validator: "company.sync", target: "name", dependencies: [], trigger: "change" }],
      },
    );
    const form = createForm(model, { environment, initialValues: { name: "a" } });
    const seen: string[] = [];
    subscribeRuntime(form, fieldSelector("name"), () => {
      throw new Error("subscriber");
    });
    subscribeRuntime(form, formSelector(), (snapshot) => {
      seen.push(String(snapshot.valid));
    });
    form.setValue("name", "b");
    expect(seen.at(-1)).toBe("false");
    expect(form.getField("name").getState().valid).toBe(false);
  });

  test("no-op value writes and unrelated siblings do not rerun custom validators", () => {
    let runs = 0;
    const { model, environment } = compileWith(
      {
        "company.sync": defineValidator({
          name: "company.sync",
          kind: "sync",
          validate: () => {
            runs += 1;
            return [];
          },
        }),
      },
      {
        validateOn: "change",
        validators: [{ validator: "company.sync", target: "name", dependencies: [], trigger: "change" }],
      },
    );
    const form = createForm(model, { environment, initialValues: { name: "Ada", email: "a@b.c" } });
    form.setValue("name", "Ada");
    expect(runs).toBe(0);
    form.setValue("email", "b@b.c");
    expect(runs).toBe(0);
    form.setValue("name", "Grace");
    expect(runs).toBe(1);
  });

  test("sync throw thenable and malformed results roll back without leaking the original exception", () => {
    for (const validate of [
      () => {
        throw new Error("secret-throw");
      },
      () => Promise.resolve([]),
      () => [{ code: 1 }],
    ]) {
      const { model, environment } = compileWith(
        {
          "company.sync": defineValidator({
            name: "company.sync",
            kind: "sync",
            validate: validate as never,
          }),
        },
        {
          validateOn: "change",
          validators: [{ validator: "company.sync", target: "name", dependencies: [], trigger: "change" }],
        },
      );
      const form = createForm(model, { environment, initialValues: { name: "Ada" } });
      const version = form.getState().version;
      expect(() => form.setValue("name", "Grace")).toThrow(FormRuntimeError);
      expect(form.getValue("name")).toBe("Ada");
      expect(form.getState().version).toBe(version);
      expect(form.getState().errors).toEqual([]);
      try {
        form.setValue("name", "Grace");
      } catch (error) {
        expect(JSON.stringify((error as FormRuntimeError).diagnostics)).not.toMatch(/secret-throw/);
      }
    }
  });

  test("two array items isolate async results and setValue does not wait", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { model, environment } = compileWith(
      {
        "company.async": defineValidator({
          name: "company.async",
          kind: "async",
          validate: async (context) => {
            await hold;
            return [{ code: String(context.target) }];
          },
        }),
      },
      {
        validateOn: "change",
        validators: [{ validator: "company.async", target: "items[].sku", dependencies: [], trigger: "change" }],
      },
    );
    const form = createForm(model, {
      environment,
      initialValues: { items: [{ sku: "left" }, { sku: "right" }] },
    });
    form.setValue("items[0].sku", "A");
    form.setValue("items[1].sku", "B");
    expect(form.getField("items[0].sku").getState().validating).toBe(true);
    expect(form.getField("items[1].sku").getState().validating).toBe(true);
    expect(form.getField("items[0].sku").getState().valid).toBe(true);
    expect(form.getState().validating).toBe(true);
    expect(form.getState().valid).toBe(true);
    release();
    while (form.getField("items[0].sku").getState().validating || form.getField("items[1].sku").getState().validating) {
      await Promise.resolve();
    }
    expect(form.getField("items[0].sku").getState().errors[0]?.code).toBe("A");
    expect(form.getField("items[1].sku").getState().errors[0]?.code).toBe("B");
    expect(form.getField("items[0].sku").getState().validating).toBe(false);
    expect(form.getState().valid).toBe(false);
  });

  test("presentation-only touch does not rerun validators or mutate raw errors", () => {
    let runs = 0;
    const { model, environment } = compileWith(
      {
        "company.sync": defineValidator({
          name: "company.sync",
          kind: "sync",
          validate: () => {
            runs += 1;
            return [{ code: "shown" }];
          },
        }),
      },
      {
        validateOn: "change",
        errorPresentation: "touched",
        validators: [{ validator: "company.sync", target: "name", dependencies: [], trigger: "change" }],
      },
    );
    const form = createForm(model, { environment, initialValues: { name: "Ada" } });
    form.setValue("name", "Grace");
    expect(runs).toBe(1);
    const raw = form.getField("name").getState().errors;
    expect(raw).toHaveLength(1);
    expect(form.getField("name").getState().valid).toBe(false);
    expect(getRuntimeSnapshot(form, presentableErrorSelector("name"))).toEqual([]);
    form.touch("name");
    expect(runs).toBe(1);
    expect(form.getField("name").getState().errors).toBe(raw);
    expect(form.getField("name").getState().valid).toBe(false);
    expect(getRuntimeSnapshot(form, presentableErrorSelector("name"))).toHaveLength(1);
  });
});
