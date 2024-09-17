import type { ArrayView, GroupView, LayoutView, ObjectView } from "@xunserver-jsf/core";
import type { LayoutBinding } from "@xunserver-jsf/react";
import { Card } from "antd";
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
  render(input) {
    const view = input.view as GroupView;
    return (
      <Card size="small" data-layout="group" {...(view.title === undefined ? {} : { title: view.title })}>
        {view.description === undefined ? null : (
          <p style={{ margin: "0 0 12px", color: "rgba(0,0,0,0.45)" }}>
            {view.description}
          </p>
        )}
        {input.children as ReactNode}
      </Card>
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
          gap: 16,
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
