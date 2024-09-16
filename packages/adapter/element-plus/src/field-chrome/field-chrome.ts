import { ElFormItem } from "element-plus";
import { h, type VNode } from "vue";
import type { FieldChromeAdapter } from "@xunserver-jsf/vue";

const FULL_WIDTH = Object.freeze({
  flex: "0 0 100%",
  width: "100%",
});

const HELP_STYLE = Object.freeze({
  ...FULL_WIDTH,
  margin: "0",
  paddingTop: "4px",
  fontSize: "var(--el-font-size-extra-small)",
  lineHeight: "1.5",
  color: "var(--el-text-color-secondary)",
});

const ERROR_STYLE = Object.freeze({
  ...FULL_WIDTH,
  position: "static",
  paddingTop: "2px",
});

export const elementPlusFieldChrome: FieldChromeAdapter = {
  render(input) {
    const label = input.field.display?.label;
    const help = input.field.display?.help;
    const errorMessages = input.presentableErrors.map((error) => error.message ?? error.code);
    const status = input.fieldSnapshot.validating
      ? "validating"
      : input.presentableErrors.length > 0
        ? "error"
        : undefined;
    const props: Record<string, unknown> = {
      required: input.fieldSnapshot.required,
      showMessage: false,
      for: input.ids.control,
    };
    if (label !== undefined && label !== "") {
      props.label = label;
    }
    if (errorMessages[0] !== undefined) {
      props.error = errorMessages[0];
    }
    if (status !== undefined) {
      props.validateStatus = status;
    }
    const extras: VNode[] = [];
    if (help !== undefined) {
      extras.push(h("div", { id: input.ids.help, style: HELP_STYLE }, help));
    }
    for (const [index, error] of input.presentableErrors.entries()) {
      extras.push(
        h(
          "div",
          {
            id: input.ids.errors[index],
            class: "el-form-item__error",
            role: "alert",
            style: ERROR_STYLE,
          },
          error.message ?? error.code,
        ),
      );
    }
    return h(ElFormItem, props, {
      label: () => h("span", { id: input.ids.label }, label ?? ""),
      default: () => (input.control === null ? extras : [input.control, ...extras]),
    });
  },
};
