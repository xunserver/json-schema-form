import { defineForm } from "../src/definition/define-form.js";
import type { FormConfig, ValidatorUse } from "../src/definition/form-config.js";
import type { JsonValue } from "../src/definition/json-value.js";

const authored = defineForm({
  schema: {
    type: "object",
    properties: {
      account: {
        type: "object",
        properties: {
          email: { type: "string" },
          username: { type: "string" },
        },
      },
    },
  },
  config: {
    schemaValidator: "ajv-2020",
    validateOn: "blur",
    errorPresentation: "touched",
    preserveServerErrorsOnChange: false,
    validators: [
      {
        validator: "company.format-email",
        target: "account.email",
        dependencies: [],
        trigger: "change",
        options: { min: 3 },
      },
      {
        validator: "company.unique-email",
        target: "account.username",
        dependencies: ["account.email"],
        trigger: ["blur", "submit"],
        options: { endpoint: "/check" },
      },
    ],
  },
});

type InferredSchemaValidator = NonNullable<typeof authored.config>["schemaValidator"];
const schemaLiteral: InferredSchemaValidator = "ajv-2020";
void schemaLiteral;

type InferredTrigger = NonNullable<typeof authored.config>["validateOn"];
const triggerLiteral: InferredTrigger = "blur";
void triggerLiteral;

type InferredPresentation = NonNullable<typeof authored.config>["errorPresentation"];
const presentationLiteral: InferredPresentation = "touched";
void presentationLiteral;

type InferredUse = NonNullable<NonNullable<typeof authored.config>["validators"]>[0];
const useValidator: InferredUse["validator"] = "company.format-email";
void useValidator;

type Options = NonNullable<InferredUse["options"]>;
type OptionsReadonly = Options extends JsonValue ? true : never;
const optionsReadonly: OptionsReadonly = true;
void optionsReadonly;

const use: ValidatorUse = {
  validator: "company.format-email",
  target: "account.email",
  dependencies: [],
  options: { min: 3 },
};
void use;

// @ts-expect-error options cannot be reassigned on a readonly use
use.options = { min: 4 };

defineForm({
  schema: true,
  config: {
    // @ts-expect-error schemaValidator is a Registry key, not an AJV instance
    schemaValidator: {},
  },
});

const rejectedUse: ValidatorUse = {
  validator: "company.format-email",
  target: "account.email",
  dependencies: [],
  // @ts-expect-error Form Config cannot embed a validator callback
  validate: () => [],
};
void rejectedUse;

defineForm({
  schema: true,
  config: {
    validators: [
      {
        validator: "company.format-email",
        target: "account.email",
        dependencies: [],
      },
    ],
  },
});

const rejectedAjv: FormConfig = {
  validateOn: "submit",
  // @ts-expect-error FormConfig has no AJV instance
  ajv: {},
};
void rejectedAjv;

const rejectedCallback: FormConfig = {
  // @ts-expect-error FormConfig has no provider callback
  validate: () => undefined,
};
void rejectedCallback;

const rejectedBinding: FormConfig = {
  // @ts-expect-error FormConfig has no Runtime binding
  instancePath: "account.email",
};
void rejectedBinding;
