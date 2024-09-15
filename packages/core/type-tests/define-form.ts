import { defineForm } from "../src/definition/define-form.js";
import type { FormDefinition } from "../src/definition/form-definition.js";
import type { ModelPathLike } from "../src/path/index.js";

const minimal = defineForm({
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
    },
  },
});

const complete = defineForm({
  schema: {
    type: "object",
    properties: {
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      },
    },
  },
  uiSchema: {
    fields: {
      "products[].name": {
        widget: "text",
        display: { label: "Name" },
      },
    },
  },
  rules: [
    {
      kind: "state",
      target: "products[].name",
      when: { eq: { field: "country" } },
    },
  ],
  config: {
    validateOn: "submit",
  },
});

const booleanTrue = defineForm({ schema: true });
const booleanFalse = defineForm({ schema: false });

void minimal;
void complete;
void booleanTrue;
void booleanFalse;

type InferredWidget = NonNullable<
  NonNullable<typeof complete.uiSchema>["fields"]
>["products[].name"]["widget"];
const widgetLiteral: InferredWidget = "text";
void widgetLiteral;

// @ts-expect-error widget name literal is preserved by defineForm
const widgetWidened: InferredWidget = "number";
void widgetWidened;

type InferredTrigger = NonNullable<typeof complete.config>["validateOn"];
const triggerLiteral: InferredTrigger = "submit";
void triggerLiteral;

const modelPathKey: ModelPathLike = "products[].name";
void modelPathKey;

defineForm({
  schema: true,
  // @ts-expect-error FormDefinition does not include runtime values
  values: { name: "Ada" },
});

defineForm({
  schema: true,
  // @ts-expect-error FormDefinition does not include runtime field state
  touched: { name: true },
});

defineForm({
  schema: true,
  // @ts-expect-error FormDefinition does not include a mutable store
  store: {},
});

defineForm({
  schema: true,
  // @ts-expect-error FormDefinition does not include framework components
  component: {},
});

defineForm({
  schema: true,
  // @ts-expect-error FormDefinition does not include DOM events
  onClick: () => undefined,
});

defineForm({
  schema: true,
  // @ts-expect-error FormDefinition does not include a concrete AJV instance
  ajv: {},
});

type Returned = ReturnType<typeof defineForm<FormDefinition>>;
type ReturnedHasRuntime = Extract<keyof Returned, "values" | "touched" | "store" | "component">;
type AssertNoRuntime = ReturnedHasRuntime extends never ? true : never;
const noRuntime: AssertNoRuntime = true;
void noRuntime;
