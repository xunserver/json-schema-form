import { compileForm, createForm, defineForm } from "../src/index.js";
import {
  arrayItemSelector,
  arrayOrderSelector,
  createSelector,
  currentBindingSelector,
  itemPathSelector,
  itemValueSelector,
} from "../src/runtime/index.js";
import type { ArrayIdentityResolver } from "../src/runtime/index.js";

const { model } = compileForm(
  defineForm({
    schema: {
      type: "object",
      properties: {
        products: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
      },
    },
  }),
);
const form = createForm(model, { initialValues: { products: [{ name: "A" }] } });
const order = arrayOrderSelector("products");
const item = form.array("products").items()[0];
if (item !== undefined) {
  void arrayItemSelector("products", item.id);
  void itemValueSelector(item.id, "name");
  void itemPathSelector(item.id);
}
void currentBindingSelector("products[0]");
void order;

const resolver: ArrayIdentityResolver = (value) => {
  if (typeof value === "object" && value !== null && "name" in value && typeof value.name === "string") {
    return value.name;
  }
  return undefined;
};
void resolver;

// @ts-expect-error callers cannot forge selector dependency keys
createSelector([{ deps: ["array-order:products"] }], (value) => value);

// @ts-expect-error ArrayStateStore is not part of the runtime barrel
import type { ArrayStateStore } from "../src/runtime/index.js";

// @ts-expect-error RuntimeNodeId is not part of the runtime barrel
import type { RuntimeNodeId } from "../src/runtime/index.js";

declare const store: ArrayStateStore;
declare const runtimeNodeId: RuntimeNodeId;
void store;
void runtimeNodeId;
