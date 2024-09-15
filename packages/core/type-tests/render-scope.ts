import { compileForm, createForm, defineForm } from "../src/index.js";
import {
  currentBindingSelector,
  getRenderScope,
  getRuntimeSnapshot,
} from "../src/runtime/index.js";
import type { InstanceBinding, RenderScope } from "../src/runtime/index.js";

const { model } = compileForm(
  defineForm({
    schema: {
      type: "object",
      properties: {
        products: {
          type: "array",
          items: { type: "object", properties: { name: { type: "string" } } },
        },
      },
    },
  }),
);
const form = createForm(model, { initialValues: { products: [{ name: "A" }] } });
const scope: RenderScope = getRenderScope(form);
const nested: RenderScope = getRenderScope(form.array("products").item(0));
const binding: InstanceBinding = scope.binding;
void nested.resolve("name");
void nested.item;
void nested.scope;
void getRuntimeSnapshot(form, currentBindingSelector("products[0]"));
void binding.nodeId;
void binding.modelPath;
void binding.path;
void binding.itemId;
void binding.itemChain;
void binding.stale;

type BindingKeys = keyof InstanceBinding;
type ForbiddenBinding = Extract<BindingKeys, "setValue" | "RuntimeNodeId" | "store" | "command">;
type AssertBinding = ForbiddenBinding extends never ? true : never;
const noWriters: AssertBinding = true;
void noWriters;

type ScopeKeys = keyof RenderScope;
type ForbiddenScope = Extract<ScopeKeys, "setValue" | "touch" | "focus" | "array" | "RuntimeNodeId" | "store">;
type AssertScope = ForbiddenScope extends never ? true : never;
const noScopeWriters: AssertScope = true;
void noScopeWriters;

// @ts-expect-error InstanceBinding is readonly
binding.stale = true;
// @ts-expect-error InstanceBinding has no writer
binding.setValue = true;
// @ts-expect-error RenderScope resolve does not accept a command
scope.resolve = true;

type Alias = import("../src/runtime/index.js").CurrentBindingSnapshot;
type AssertAlias = Alias extends InstanceBinding ? (InstanceBinding extends Alias ? true : never) : never;
const aliasOk: AssertAlias = true;
void aliasOk;

// @ts-expect-error RuntimeNodeId is not part of the runtime barrel
import type { RuntimeNodeId } from "../src/runtime/index.js";
declare const runtimeNodeId: RuntimeNodeId;
void runtimeNodeId;
