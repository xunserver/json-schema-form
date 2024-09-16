import { describe, expect, test, vi } from "vitest";
import type { WidgetRenderInput } from "@form/vue";
import { applyCodecChange } from "./controlled.js";
import { stringCodec } from "./codecs.js";
import { selectBinding } from "./bindings.js";

function makeInput(overrides: Partial<WidgetRenderInput["fieldSnapshot"]> = {}): WidgetRenderInput {
  return {
    field: {
      path: "title",
      widget: "text",
      display: { label: "Title" },
    },
    view: { id: "view:title" },
    value: "kept",
    fieldSnapshot: {
      active: true,
      visible: true,
      disabled: false,
      readonly: false,
      required: false,
      touched: false,
      dirty: false,
      validating: false,
      valid: true,
      ...overrides,
    },
    presentableErrors: [],
    nativeProps: {},
    ids: {
      control: "control-title",
      label: "label-title",
      help: "help-title",
      errors: [],
    },
    actions: {
      setValue: vi.fn(),
      touch: vi.fn(),
      focus: vi.fn(),
      blur: vi.fn(),
    },
    reportDiagnostic: vi.fn(),
  } as unknown as WidgetRenderInput;
}

describe("element-plus readonly guards", () => {
  test("applyCodecChange ignores updates when readonly", () => {
    const input = makeInput({ readonly: true });
    applyCodecChange(input, stringCodec, "changed");
    expect(input.actions.setValue).not.toHaveBeenCalled();
  });

  test("applyCodecChange ignores updates when disabled", () => {
    const input = makeInput({ disabled: true });
    applyCodecChange(input, stringCodec, "changed");
    expect(input.actions.setValue).not.toHaveBeenCalled();
  });

  test("select binding disables native control when readonly", () => {
    const input = makeInput({ readonly: true });
    input.field = { ...input.field, widget: "select", props: { options: ["a"] } };
    const vnode = selectBinding.render(input) as { props?: Record<string, unknown> };
    expect(vnode.props?.disabled).toBe(true);
  });
});
