import type { ArrayView, GroupView, LayoutView, ObjectView } from "@xunserver-jsf/core";
import type { LayoutBinding } from "@xunserver-jsf/vue";
import { ElCard, ElCol, ElRow } from "element-plus";
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
    const view = input.view as GroupView;
    const header =
      view.title !== undefined || view.description !== undefined
        ? () =>
            h("div", [
              view.title === undefined ? null : h("div", view.title),
              view.description === undefined
                ? null
                : h(
                    "p",
                    {
                      style: {
                        margin: view.title === undefined ? "0" : "4px 0 0",
                        fontSize: "13px",
                        color: "var(--el-text-color-secondary)",
                        fontWeight: 400,
                      },
                    },
                    view.description,
                  ),
            ])
        : undefined;
    return h(
      ElCard,
      { shadow: "never", "data-layout": "group" },
      {
        ...(header === undefined ? {} : { header }),
        default: () => [...input.children],
      },
    );
  },
};

export const gridLayout: LayoutBinding = {
  render(input) {
    const view = input.view as LayoutView;
    const columns = view.columns ?? 1;
    const gutter = 16;
    return h(ElRow, { gutter }, () =>
      input.children.map((child, index) =>
        h(ElCol, { key: index, span: view.span ?? Math.floor(24 / columns) }, () => child),
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
