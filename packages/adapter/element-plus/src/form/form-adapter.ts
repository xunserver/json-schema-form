import { ElForm, ID_INJECTION_KEY, ZINDEX_INJECTION_KEY } from "element-plus";
import { defineComponent, h, provide } from "vue";
import type { FormAdapter } from "@form/vue";

const ElementPlusSsrBridge = defineComponent({
  name: "ElementPlusSsrBridge",
  setup(_, { slots }) {
    provide(ID_INJECTION_KEY, { prefix: 1024, current: 0 });
    provide(ZINDEX_INJECTION_KEY, { current: 0 });
    return () => slots.default?.();
  },
});

export const elementPlusFormAdapter: FormAdapter = {
  render(input) {
    return h(ElementPlusSsrBridge, () =>
      h(
        ElForm,
        {
          id: input.ids.form,
          labelPosition: "top",
          onSubmit: (event: Event) => {
            event.preventDefault();
            input.submit();
          },
        },
        () => input.content,
      ),
    );
  },
};
