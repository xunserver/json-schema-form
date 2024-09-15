import { compileForm, createForm, defineForm } from "../src/index.js";
import type {
  ArrayInstance,
  ArrayItemId,
  ArrayItemRef,
  ArrayItemSnapshot,
  FormInstance,
  ScopedFormInstance,
} from "../src/index.js";

const { model } = compileForm(
  defineForm({
    schema: {
      type: "object",
      properties: {
        products: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" } },
          },
        },
      },
    },
  }),
);

const form: FormInstance = createForm(model, { initialValues: { products: [{ name: "A" }] } });
const array: ArrayInstance = form.array("products");
const items: readonly ArrayItemSnapshot[] = array.items();
const first = items[0];
const id: ArrayItemId | undefined = first?.id;
const ref: ArrayItemRef = 0;
const scoped: ScopedFormInstance = array.item(ref);
const byId: ScopedFormInstance = id === undefined ? scoped : array.item(id);
const nested: ScopedFormInstance = form.scope("products[0]");
void nested.array;
void nested.scope;

array.append({ name: "B" });
array.insert(0, { name: "C" });
array.setItemValue(0, { name: "D" });
array.replaceItem(0, { name: "E" });
array.move(0, 1);
array.remove(0);
array.clear();
form.array("products").item(0).setValue("name", "Z");
form.scope("products[0]").getField("name").touch();
void scoped.getValue("name");
void byId.path;
void nested.scope;

const snapshot = array.items()[0];
if (snapshot !== undefined) {
  // @ts-expect-error item snapshot is readonly
  snapshot.index = 2;
  // @ts-expect-error item id is readonly
  snapshot.id = "x" as ArrayItemId;
}

type ScopedKeys = keyof ScopedFormInstance;
type Forbidden = Extract<ScopedKeys, "setValues" | "reset" | "validate" | "submit" | "serialize">;
type Assert = Forbidden extends never ? true : never;
const ok: Assert = true;
void ok;
