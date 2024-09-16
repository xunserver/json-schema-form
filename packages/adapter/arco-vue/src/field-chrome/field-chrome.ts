import { FormItem } from "@arco-design/web-vue";
import { h } from "vue";
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
    };
    if (status !== undefined) {
      props.validateStatus = status;
    }
    return h(FormItem, props, () => [
      h("span", { id: input.ids.label }, label ?? ""),
      input.control,
      help === undefined ? null : h("p", { id: input.ids.help }, help),
      ...input.presentableErrors.map((error, index) =>
        h("p", { id: input.ids.errors[index], role: "alert" }, error.message ?? error.code),
      ),
    ]);
  },
};
