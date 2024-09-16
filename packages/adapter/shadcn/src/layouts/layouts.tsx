import type { ArrayView, GroupView, LayoutView, ObjectView } from "@xunserver-jsf/core";
import type { LayoutBinding } from "@xunserver-jsf/react";
import type { ReactNode } from "react";
import type { ShadcnAdapterComponents } from "../components.js";

export function createLayoutBindings(
  components: ShadcnAdapterComponents,
): Readonly<Record<string, LayoutBinding>> {
  const Collapsible = components.Collapsible;

  const objectLayout: LayoutBinding = {
    render(input) {
      return (
        <section data-layout="object" data-path={(input.view as ObjectView).path}>
          {input.children as ReactNode}
        </section>
      );
    },
  };

  const arrayLayout: LayoutBinding = {
    render(input) {
      return (
        <section data-layout="array" data-path={(input.view as ArrayView).path}>
          {input.children as ReactNode}
        </section>
      );
    },
  };

  const groupLayout: LayoutBinding = {
    collapsible: true,
    render(input) {
      const view = input.view as GroupView;
      return (
        <Collapsible
          open={!input.viewSnapshot.collapsed}
          onOpenChange={(open) => {
            input.actions.setCollapsed(!open);
          }}
          title={view.id}
        >
          {input.children as ReactNode}
        </Collapsible>
      );
    },
  };

  const gridLayout: LayoutBinding = {
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

  return Object.freeze({
    object: objectLayout,
    array: arrayLayout,
    group: groupLayout,
    layout: gridLayout,
  });
}
