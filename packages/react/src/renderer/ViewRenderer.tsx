import type { ViewNode } from "@xunserver-jsf/core";
import type { ReactNode } from "react";
import { ArrayRenderer } from "./ArrayRenderer.js";
import { FieldRenderer } from "./FieldRenderer.js";
import { GroupRenderer } from "./GroupRenderer.js";
import { LayoutRenderer } from "./LayoutRenderer.js";
import { ObjectRenderer } from "./ObjectRenderer.js";

export function ViewRenderer({ node }: { readonly node: ViewNode }): ReactNode {
  switch (node.kind) {
    case "field":
      return <FieldRenderer node={node} />;
    case "object":
      return <ObjectRenderer node={node} />;
    case "array":
      return <ArrayRenderer node={node} />;
    case "group":
      return <GroupRenderer node={node} />;
    case "layout":
      return <LayoutRenderer node={node} />;
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}
