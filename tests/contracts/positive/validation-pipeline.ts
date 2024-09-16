import {
  compileForm,
  createForm,
  defineForm,
  type ValidationError,
  type ValidationResult,
} from "@xunserver-jsf/core";
import {
  createFormEnvironment,
  definePlugin,
  defineValidator,
} from "@xunserver-jsf/core/extension";
import { presentableErrorSelector, subscribeRuntime } from "@xunserver-jsf/core/runtime";
import { AJV_VALIDATOR_KEY, createAjvValidator } from "@xunserver-jsf/validator-ajv";

const uniqueEmail = defineValidator({
  name: "company.unique-email",
  kind: "async",
  validate: async () => [],
});

const environment = createFormEnvironment({
  plugins: [
    definePlugin({
      id: "company",
      dependsOn: ["core"],
      contributes: {
        validators: {
          [AJV_VALIDATOR_KEY]: createAjvValidator(),
          "company.unique-email": uniqueEmail,
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
        email: { type: "string" },
        name: { type: "string" },
      },
      required: ["email"],
    },
    config: {
      schemaValidator: AJV_VALIDATOR_KEY,
      validateOn: "submit",
      errorPresentation: "touched-or-submitted",
      validators: [
        {
          validator: "company.unique-email",
          target: "email",
          dependencies: [],
          trigger: "blur",
        },
      ],
    },
  }),
  { environment },
);

export const form = createForm(model, { environment, initialValues: { email: "a@b.c", name: "Ada" } });

export async function run(): Promise<ValidationResult> {
  form.applyErrors([{ code: "remote", instancePath: "email" }]);
  const result = await form.validate();
  const errors: readonly ValidationError[] = result.errors;
  void errors;
  await form.submit(async (payload) => {
    void payload;
  });
  return result;
}

subscribeRuntime(form, presentableErrorSelector("email"), (errors) => {
  void errors;
});
void form.getState().valid;
void form.getState().validating;
void form.getState().submitting;
void form.array;
void form.scope;
void form.serialize;
