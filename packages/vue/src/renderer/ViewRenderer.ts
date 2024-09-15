import type { ViewNode } from "@form/core";
import { defineComponent, h, type PropType, type VNode } from "vue";
import { viewRenderers } from "./registry.js";

export const ViewRenderer = defineComponent({
  name: "ViewRenderer",
  props: {
    node: { type: Object as PropType<ViewNode>, required: true },
  },
  setup(props) {
    return (): VNode | null => {
      const component = viewRenderers[props.node.kind];
      if (component === undefined) {
        return null;
      }
      return h(component, { node: props.node });
    };
  },
});
