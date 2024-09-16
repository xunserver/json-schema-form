import { ElFormItem } from "element-plus";
import { h } from "vue";
import type { FieldChromeAdapter } from "@form/vue";

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
    };
    if (errorMessages[0] !== undefined) {
      props.error = errorMessages[0];
    }
    if (status !== undefined) {
      props.validateStatus = status;
    }
    return h(ElFormItem, props, () => [
      h("span", { id: input.ids.label }, label ?? ""),
      input.control,
      help === undefined ? null : h("p", { id: input.ids.help }, help),
      ...input.presentableErrors.map((error, index) =>
        h("p", { id: input.ids.errors[index], role: "alert" }, error.message ?? error.code),
      ),
    ]);
  },
};
