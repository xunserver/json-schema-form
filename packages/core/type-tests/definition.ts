import type { FormDefinition } from "../src/definition/form-definition.js";
import type { FieldUI } from "../src/definition/ui-schema.js";

const schemaOnly: FormDefinition = {
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
    },
  },
};

const booleanFalse: FormDefinition = {
  schema: false,
};

void booleanFalse;

const withOptionalContracts: FormDefinition = {
  schema: true,
  uiSchema: {
    fields: {
      name: {
        widget: "text",
        display: { label: "Name" },
        behavior: { visible: true },
      },
    },
  },
  rules: [
    {
      kind: "state",
      target: "name",
      when: { eq: [{ field: "country" }, "CN"] },
      action: { visible: true },
    },
  ],
  config: {
    validateOn: "submit",
  },
};

void schemaOnly;
void withOptionalContracts;

const rejectedRuntimeMember: FormDefinition = {
  schema: { type: "string" },
  // @ts-expect-error FormDefinition does not include runtime values
  values: { name: "Ada" },
};

void rejectedRuntimeMember;

const rejectedFrameworkMember: FormDefinition = {
  schema: { type: "string" },
  // @ts-expect-error FormDefinition does not include framework components
  component: {},
};

void rejectedFrameworkMember;

const rejectedValidatorMember: FormDefinition = {
  schema: { type: "string" },
  // @ts-expect-error FormDefinition does not include a concrete AJV instance
  ajv: {},
};

void rejectedValidatorMember;

const arrayItemUi: FormDefinition = {
  schema: true,
  uiSchema: {
    fields: {
      "products[].name": {
        widget: "text",
      },
    },
  },
};

void arrayItemUi;

type FieldUIKeys = keyof FieldUI;
type AssertNoFieldRequired = Extract<FieldUIKeys, "required"> extends never ? true : never;
const noFieldRequired: AssertNoFieldRequired = true;
void noFieldRequired;

const rejectedFieldRequired: FieldUI = {
  widget: "text",
  // @ts-expect-error FieldUI does not include required
  required: true,
};
void rejectedFieldRequired;

type FormDefinitionKeys = keyof FormDefinition;
type UnexpectedDefinitionKeys =
  | "values"
  | "store"
  | "component"
  | "document"
  | "Ajv"
  | "touched";

type AssertNoUnexpectedKeys = Extract<FormDefinitionKeys, UnexpectedDefinitionKeys> extends never
  ? true
  : never;

const noUnexpectedKeys: AssertNoUnexpectedKeys = true;
void noUnexpectedKeys;
