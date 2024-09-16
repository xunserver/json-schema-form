import type { ArrayView, GroupView, LayoutView, ObjectView } from "@xunserver-jsf/core";
import type { LayoutBinding } from "@xunserver-jsf/react";
import { Collapse } from "antd";
import type { ReactNode } from "react";

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
    const panelKey = view.id;
    return (
      <Collapse
        activeKey={input.viewSnapshot.collapsed ? [] : [panelKey]}
        onChange={(keys: string | string[]) => {
          const active = Array.isArray(keys) ? keys : [keys];
          input.actions.setCollapsed(!active.includes(panelKey));
        }}
        items={[
          {
            key: panelKey,
            label: view.id,
            children: input.children as ReactNode,
          },
        ]}
      />
    );
  },
};

export const gridLayout: LayoutBinding = {
  render(input) {
    const view = input.view as LayoutView;
    const columns = view.columns ?? 1;
    return (
      <div
        data-layout="grid"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: "0.5rem",
        }}
      >
        {input.children.map((child, index) => (
          <div
            key={index}
            style={view.span === undefined ? undefined : { gridColumn: `span ${view.span}` }}
          >
            {child}
          </div>
        ))}
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
