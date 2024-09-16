import type { ArrayView, GroupView, LayoutView, ObjectView } from "@form/core";
import type { LayoutBinding } from "@form/react";
import { Collapse } from "@arco-design/web-react";
import type { CSSProperties, ReactNode } from "react";

export const objectLayout: LayoutBinding = {
  render(input) {
    return (
      <section data-layout="object" data-path={(input.view as ObjectView).path}>
        {input.children as ReactNode}
      </section>
    );
  },
};

export const arrayLayout: LayoutBinding = {
  render(input) {
    return (
      <section data-layout="array" data-path={(input.view as ArrayView).path}>
        {input.children as ReactNode}
      </section>
    );
  },
};

export const groupLayout: LayoutBinding = {
  collapsible: true,
  render(input) {
    const view = input.view as GroupView;
    const activeKey = input.viewSnapshot.collapsed ? [] : [view.id];
    return (
      <Collapse
        activeKey={activeKey}
        onChange={(_key, keys) => {
          input.actions.setCollapsed(keys.length === 0);
        }}
      >
        <Collapse.Item header={view.id} name={view.id}>
          {input.children as ReactNode}
        </Collapse.Item>
      </Collapse>
    );
  },
};

export const gridLayout: LayoutBinding = {
  render(input) {
    const view = input.view as LayoutView;
    const columns = view.columns ?? 1;
    const gridStyle: CSSProperties = {
      display: "grid",
      gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
      gap: 16,
    };
    return (
      <div data-layout="grid" style={gridStyle}>
        {input.children.map((child, index) => {
          const spanStyle: CSSProperties | undefined =
            view.span === undefined ? undefined : { gridColumn: `span ${view.span}` };
          return (
            <div key={index} style={spanStyle}>
              {child}
            </div>
          );
        })}
      </div>
    );
  },
};

export const layoutBindings: Readonly<Record<string, LayoutBinding>> = Object.freeze({
  object: objectLayout,
  array: arrayLayout,
  group: groupLayout,
  layout: gridLayout,
});
