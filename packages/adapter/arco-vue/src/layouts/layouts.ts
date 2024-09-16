import type { ArrayView, GroupView, LayoutView, ObjectView } from "@form/core";
import type { LayoutBinding } from "@form/vue";
import { Col, Collapse, CollapseItem, Row } from "@arco-design/web-vue";
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
  collapsible: true,
  render(input) {
    const view = input.view as GroupView;
    const name = view.id;
    return h(
      Collapse,
      {
        activeKey: input.viewSnapshot.collapsed ? [] : [name],
        "onUpdate:activeKey": (value: string | number | (string | number)[]) => {
          const values = Array.isArray(value) ? value.map(String) : [String(value)];
          input.actions.setCollapsed(!values.includes(name));
        },
      },
      () => h(CollapseItem, { key: name, header: "Group" }, () => [...input.children]),
    );
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
