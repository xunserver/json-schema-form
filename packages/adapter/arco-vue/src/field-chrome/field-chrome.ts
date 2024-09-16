import { FormItem } from "@arco-design/web-vue";
import { h, type VNode } from "vue";
import type { FieldChromeAdapter } from "@xunserver-jsf/vue";

export const arcoVueFieldChrome: FieldChromeAdapter = {
  render(input) {
    const label = input.field.display?.label;
    const help = input.field.display?.help;
    const status = input.fieldSnapshot.validating
      ? "validating"
      : input.presentableErrors.length > 0
        ? "error"
        : undefined;
    const props: Record<string, unknown> = {
      required: input.fieldSnapshot.required,
      feedback: false,
      showColon: false,
      labelAttrs: { for: input.ids.control },
    };
    if (label !== undefined && label !== "") {
      props.label = label;
    }
    if (status !== undefined) {
      props.validateStatus = status;
    }
    const slots: Record<string, () => VNode | VNode[]> = {
      label: () => h("span", { id: input.ids.label }, label ?? ""),
      default: () => (input.control === null ? [] : [input.control]),
    };
    if (help !== undefined) {
      slots.extra = () => h("div", { id: input.ids.help }, help);
    }
    if (input.presentableErrors.length > 0) {
      slots.help = () =>
        input.presentableErrors.map((error, index) =>
          h(
            "div",
            {
              id: input.ids.errors[index],
              role: "alert",
            },
            error.message ?? error.code,
          ),
        );
    }
    return h(FormItem, props, slots);
  },
};
