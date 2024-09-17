import type { ArrayView, LayoutView, ObjectView } from "@xunserver-jsf/core";
import type { LayoutBinding } from "@xunserver-jsf/vue";
import { Card, Col, Row } from "@arco-design/web-vue";
import { h } from "vue";

export const objectLayout: LayoutBinding = {
  render(input) {
    return h("section", { "data-layout": "object", "data-path": (input.view as ObjectView).path }, [...input.children]);
  },
};

export const arrayLayout: LayoutBinding = {
  render(input) {
    return h("section", { "data-layout": "array", "data-path": (input.view as ArrayView).path }, [...input.children]);
  },
};

export const groupLayout: LayoutBinding = {
  render(input) {
    return h(Card, { bordered: true, "data-layout": "group" }, () => [...input.children]);
  },
};

export const gridLayout: LayoutBinding = {
  render(input) {
    const view = input.view as LayoutView;
    const columns = view.columns ?? 1;
    const gutter = 16;
    return h(Row, { gutter }, () =>
      input.children.map((child, index) =>
        h(Col, { key: index, span: view.span ?? Math.floor(24 / columns) }, () => child),
      ),
    );
  },
};

export const layoutBindings: Readonly<Record<string, LayoutBinding>> = Object.freeze({
  object: objectLayout,
  array: arrayLayout,
  group: groupLayout,
  layout: gridLayout,
});
