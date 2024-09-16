import { describe, expect, test } from "vitest";
import { compileForm, createForm, createFormEngine, defineForm } from "@xunserver-jsf/core";
import { getRenderScope, subscribeRuntime, valueSelector } from "@xunserver-jsf/core/runtime";
import { compileV1, fieldViewId } from "../fixtures/v1/index.js";

describe("v1 public API composition", () => {
  test("V1-PUBLIC-API-DEFAULT composes the default Environment path", () => {
    const { form, model } = compileV1("default");
    expect(model.data).toBeDefined();
    form.setValue("name", "Grace");
    expect(form.getValue("name")).toBe("Grace");
    form.setValues({ ...form.getValues() as object, age: 1 });
    expect(form.getField("age").getState().value).toBe(1);
    form.touch("name");
    form.focus(fieldViewId(form, "name"));
    form.blur(fieldViewId(form, "name"));
    form.setCollapsed(model.ui.viewTree.id, true);
    form.setActiveTab(model.ui.viewTree.id, null);
    expect(form.array("products").items()).toHaveLength(2);
    expect(form.scope("products[0]").getValue("title")).toBe("First");
    form.reset();
    expect(form.getValue("name")).toBe("Ada");
    expect(form.serialize()).toMatchObject({ name: "Ada" });
    expect(getRenderScope(form).resolve("name")).toBe("name");
  });

  test("V1-PUBLIC-API-EXPLICIT composes an explicit Environment", async () => {
    const { form } = compileV1("explicit");
    const result = await form.validate();
    expect(result.superseded).toBe(false);
    const submitted = await form.submit(async (payload) => payload);
    expect(submitted.submitted === true || submitted.valid === false).toBe(true);
  });

  test("V1-PUBLIC-API-ENGINE composes FormEngine compile and create", () => {
    const { form, engine } = compileV1("engine");
    expect(engine).toBeDefined();
    const again = engine!.compile(defineForm({ schema: { type: "object", properties: { n: { type: "string" } } } }));
    const second = engine!.create(again.model, { initialValues: { n: "x" } });
    expect(second.getValue("n")).toBe("x");
    expect(form.getValue("name")).toBe("Ada");
    const unsubscribe = subscribeRuntime(form, valueSelector("name"), () => undefined);
    unsubscribe();
    expect(createFormEngine().compile).toEqual(expect.any(Function));
    expect(compileForm).toEqual(expect.any(Function));
    expect(createForm).toEqual(expect.any(Function));
  });
});
