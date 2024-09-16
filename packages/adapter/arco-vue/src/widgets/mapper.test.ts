import { compileForm, createForm, defineForm } from "@form/core";
import { describe, expect, test } from "vitest";
import { RENDERER_DIAGNOSTIC_CODES, RendererAdapterError, type WidgetRenderInput } from "@form/vue";
import { mapArcoVueProps } from "./mapper.js";

function input(overrides?: Partial<WidgetRenderInput>): WidgetRenderInput {
  const form = createForm(
    compileForm(
      defineForm({
        schema: { type: "object", properties: { name: { type: "string" } } },
        uiSchema: {
          fields: {
            name: {
              widget: "text",
              props: { placeholder: "Name" },
              native: {
                "arco-vue": { size: "small" },
                antd: { variant: "filled" },
              },
            },
          },
        },
      }),
    ).model,
  );
  const field = form.model.ui.fields.get("name")!;
  const view = form.model.ui.viewTree.kind === "object" ? form.model.ui.viewTree.children[0]! : form.model.ui.viewTree;
  return {
    field,
    view: view.kind === "field" ? view : { kind: "field", id: "view:field:name", fieldPath: "name" },
    scope: undefined as never,
    value: "Ada",
    fieldSnapshot: form.getField("name").getState(),
    viewSnapshot: {
      id: "view:field:name",
      focused: false,
      collapsed: false,
      activeTab: undefined,
      active: true,
      visible: true,
      disabled: false,
      readonly: false,
      required: false,
    },
    presentableErrors: [],
    ids: { prefix: "p", control: "c", label: "l", help: "h", errors: [] },
    nativeProps: {},
    actions: {
      setValue() {},
      touch() {},
      focus() {},
      blur() {},
    },
    reportDiagnostic() {},
    ...overrides,
  };
}

describe("arco-vue mapper", () => {
  test("merges logical props and arco-vue native options, ignoring other namespaces", () => {
    const mapped = mapArcoVueProps(input());
    expect(mapped).toMatchObject({ placeholder: "Name", size: "small" });
    expect(mapped).not.toHaveProperty("variant");
    expect(Object.isFrozen(mapped)).toBe(true);
  });

  test("rejects protected keys and handlers", () => {
    const form = createForm(
      compileForm(
        defineForm({
          schema: { type: "object", properties: { name: { type: "string" } } },
          uiSchema: {
            fields: {
              name: {
                native: {
                  "arco-vue": { modelValue: "hack" },
                },
              },
            },
          },
        }),
      ).model,
    );
    const field = form.model.ui.fields.get("name")!;
    expect(() => mapArcoVueProps(input({ field }))).toThrow(RendererAdapterError);
    try {
      mapArcoVueProps(input({ field }));
    } catch (error) {
      expect((error as RendererAdapterError).diagnostic.code).toBe(RENDERER_DIAGNOSTIC_CODES.MAPPER_PROTECTED_KEY);
      expect((error as RendererAdapterError).diagnostic.source).toBe("adapter");
      expect((error as RendererAdapterError).diagnostic.metadata).not.toHaveProperty("cause");
    }
  });
});
