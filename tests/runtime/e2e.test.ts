import { describe, expect, test } from "vitest";
import { compileForm, createForm, createFormEngine, defineForm } from "@xunserver-jsf/core";
import { createFormEnvironment } from "@xunserver-jsf/core/extension";
import {
  formSelector,
  getRuntimeSnapshot,
  observeRuntimeDiagnostics,
  subscribeRuntime,
  valueSelector,
} from "@xunserver-jsf/core/runtime";

const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
    },
  },
});

describe("transactional runtime paths", () => {
  test("default, explicit, and engine paths share the same command semantics", () => {
    const environment = createFormEnvironment();
    const engine = createFormEngine();
    const defaultForm = createForm(compileForm(definition).model, { initialValues: { name: "Ada", age: 1 } });
    const explicitForm = createForm(compileForm(definition, { environment }).model, {
      environment,
      initialValues: { name: "Ada", age: 1 },
    });
    const engineForm = engine.create(engine.compile(definition).model, { initialValues: { name: "Ada", age: 1 } });

    for (const form of [defaultForm, explicitForm, engineForm]) {
      const versions: number[] = [];
      subscribeRuntime(form, formSelector(), (snapshot) => {
        versions.push(snapshot.version);
      });
      expect(getRuntimeSnapshot(form, valueSelector("name"))).toBe("Ada");
      form.setValue("name", "Grace");
      form.touch("name");
      form.setValues({ name: "Linus", age: 2 });
      form.reset();
      form.setValue("name", "Ada");
      expect(form.getState().version).toBe(4);
      expect(versions).toEqual([1, 2, 3, 4]);
      expect(form.getValue("name")).toBe("Ada");
      expect(form.getField("name").getState().dirty).toBe(false);
    }
  });

  test("reports runtime diagnostics without changing version for observers", () => {
    const form = createForm(compileForm(definition).model, { initialValues: { name: "Ada" } });
    const codes: string[] = [];
    observeRuntimeDiagnostics(form, (event) => {
      codes.push(...event.diagnostics.map((item) => item.code));
    });
    subscribeRuntime(form, valueSelector("name"), () => {
      throw new Error("listener");
    });
    form.setValue("name", "Grace");
    expect(form.getState().version).toBe(1);
    expect(codes.length).toBeGreaterThan(0);
  });
});
