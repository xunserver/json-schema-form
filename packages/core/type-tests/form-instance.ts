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
form.blur(model.ui.viewTree.id);
form.setCollapsed(model.ui.viewTree.id, true);
form.setActiveTab(model.ui.viewTree.id, "advanced");
form.setActiveTab(model.ui.viewTree.id, null);
form.reset();
field.setValue("Ada");
field.touch();
void field.getValue();
void value;
void values;
void state.version;
void fieldState.dirty;

form.serialize({ includeInactive: true });
void form.validate;
void form.applyErrors;
void form.submit;

const array = form.array;
const scoped = form.scope;
void array;
void scoped;

type ScopedKeys = keyof import("../src/index.js").ScopedFormInstance;
type ForbiddenScoped = Extract<ScopedKeys, "setValues" | "reset" | "validate" | "submit" | "serialize">;
type AssertNoScopedRoot = ForbiddenScoped extends never ? true : never;
const noScopedRoot: AssertNoScopedRoot = true;
void noScopedRoot;

type AssertEngine = FormEngine["compile"] | FormEngine["create"];
const engineMethods: AssertEngine | undefined = undefined;
void engineMethods;

const snapshot = form.getState();
// @ts-expect-error Form snapshot version is readonly
snapshot.version = 2;

void snapshot.active;
void snapshot.visible;
void snapshot.disabled;
void snapshot.readonly;
void snapshot.valid;
void snapshot.validating;
void snapshot.submitting;
void snapshot.submitCount;
void snapshot.errors;
void snapshot.directErrors;

const fieldValues = field.getState();
void fieldValues.required;
void fieldValues.valid;
void fieldValues.validating;
void fieldValues.errors;
void fieldValues.directErrors;
// @ts-expect-error field snapshot is readonly
fieldValues.touched = true;
// @ts-expect-error required is readonly
fieldValues.required = false;
// @ts-expect-error field errors are readonly
fieldValues.errors = [];
// @ts-expect-error form valid is readonly
snapshot.valid = false;

type EffectiveKeys = keyof import("../src/index.js").EffectiveState;
type AllowedEffective = "active" | "visible" | "disabled" | "readonly" | "required";
type AssertEffective =
  EffectiveKeys extends AllowedEffective ? (AllowedEffective extends EffectiveKeys ? true : never) : never;
const exhaustiveEffective: AssertEffective = true;
void exhaustiveEffective;

type ViewKeys = keyof import("../src/index.js").ViewSnapshot;
type AssertViewCollapsed = "collapsed" extends ViewKeys ? true : never;
type AssertViewTab = "activeTab" extends ViewKeys ? true : never;
type AssertViewRequired = "required" extends ViewKeys ? true : never;
const viewFields: AssertViewCollapsed & AssertViewTab & AssertViewRequired = true;
void viewFields;

declare const viewSnapshot: import("../src/index.js").ViewSnapshot;
void viewSnapshot.collapsed;
void viewSnapshot.activeTab;
void viewSnapshot.required;
// @ts-expect-error view snapshot collapsed is readonly
viewSnapshot.collapsed = true;
// @ts-expect-error view snapshot activeTab is readonly
viewSnapshot.activeTab = "x";
// @ts-expect-error view snapshot required is readonly
viewSnapshot.required = true;
// @ts-expect-error view commands do not accept InstancePath
form.blur("name");
// @ts-expect-error view commands do not accept index
form.setCollapsed(0, true);
// @ts-expect-error view snapshots have no writers
viewSnapshot.setCollapsed = true;

const rootValues = form.getValues();
if (typeof rootValues === "object" && rootValues !== null && !Array.isArray(rootValues)) {
  // @ts-expect-error public values snapshot is readonly
  rootValues.name = "mutated";
}

const products = form.array("name");
void products.items;
const nested = form.scope("name");
void nested.getField;
const payload = form.serialize();
void payload;
void form.validate();
form.applyErrors([{ code: "remote", instancePath: "name" }]);
void form.submit(async (serialized) => serialized);

type FormKeys = keyof FormInstance;
type AssertValidate = "validate" extends FormKeys ? true : never;
type AssertApply = "applyErrors" extends FormKeys ? true : never;
type AssertSubmit = "submit" extends FormKeys ? true : never;
const hasValidationFacades: AssertValidate & AssertApply & AssertSubmit = true;
void hasValidationFacades;
