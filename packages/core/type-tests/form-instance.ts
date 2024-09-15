import { createForm, defineForm, compileForm } from "../src/index.js";
import type {
  CreateFormOptions,
  FieldInstance,
  FieldSnapshot,
  FormEngine,
  FormInstance,
  FormSnapshot,
} from "../src/index.js";

const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
    },
  },
});

const { model } = compileForm(definition);
const form: FormInstance = createForm(model, { initialValues: { name: "Ada" } } satisfies CreateFormOptions);

const value: unknown = form.getValue("name");
const values = form.getValues();
const state: FormSnapshot = form.getState();
const field: FieldInstance = form.getField("name");
const fieldState: FieldSnapshot = field.getState();

form.setValue("name", "Grace");
form.setValues({ name: "Linus" });
form.touch("name");
form.focus(model.ui.viewTree.id);
form.reset();
field.setValue("Ada");
field.touch();
void field.getValue();
void value;
void values;
void state.version;
void fieldState.dirty;

type FormKeys = keyof FormInstance;
type ForbiddenFacades = Extract<
  FormKeys,
  "array" | "scope" | "validate" | "applyErrors" | "submit" | "serialize"
>;
type AssertNoLaterFacades = ForbiddenFacades extends never ? true : never;
const noLaterFacades: AssertNoLaterFacades = true;
void noLaterFacades;

type AssertEngine = FormEngine["compile"] | FormEngine["create"];
const engineMethods: AssertEngine | undefined = undefined;
void engineMethods;

const snapshot = form.getState();
// @ts-expect-error Form snapshot version is readonly
snapshot.version = 2;

const rootValues = form.getValues();
if (typeof rootValues === "object" && rootValues !== null && !Array.isArray(rootValues)) {
  // @ts-expect-error public values snapshot is readonly
  rootValues.name = "mutated";
}

const fieldValues = field.getState();
// @ts-expect-error field snapshot is readonly
fieldValues.touched = true;

// @ts-expect-error baseline snapshots do not claim active
const active = snapshot.active;
void active;

// @ts-expect-error baseline snapshots do not claim visible
const visible = snapshot.visible;
void visible;

// @ts-expect-error baseline snapshots do not claim valid
const valid = snapshot.valid;
void valid;
