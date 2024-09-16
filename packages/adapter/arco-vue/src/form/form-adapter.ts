import { Form } from "@arco-design/web-vue";
import { h, type Component } from "vue";
import type { FormAdapter } from "@xunserver-jsf/vue";

const EMPTY_MODEL: Record<string, unknown> = {};

export const arcoVueFormAdapter: FormAdapter = {
  render(input) {
    return h(
      Form as Component,
      {
        id: input.ids.form,
        model: EMPTY_MODEL,
        layout: "vertical",
        labelAlign: "left",
        autoLabelWidth: false,
        onSubmit: (
          _data: { values: Record<string, unknown>; errors: Record<string, unknown> | undefined },
          event: Event,
        ) => {
          event.preventDefault();
          input.submit();
        },
      },
      () => input.content,
    );
  },
};
