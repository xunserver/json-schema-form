import type { ArrayView, LayoutView, ObjectView } from "@xunserver-jsf/core";
import type { LayoutBinding } from "@xunserver-jsf/react";
import { Card } from "@arco-design/web-react";
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
  render(input) {
    return (
      <Card data-layout="group" bordered>
        {input.children as ReactNode}
      </Card>
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
