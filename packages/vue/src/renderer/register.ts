import { ArrayRenderer } from "./ArrayRenderer.js";
import { FieldRenderer } from "./FieldRenderer.js";
import { GroupRenderer } from "./GroupRenderer.js";
import { LayoutRenderer } from "./LayoutRenderer.js";
import { ObjectRenderer } from "./ObjectRenderer.js";
import { viewRenderers } from "./registry.js";

export function registerViewRenderers(): void {
  viewRenderers.field = FieldRenderer;
  viewRenderers.object = ObjectRenderer;
  viewRenderers.array = ArrayRenderer;
  viewRenderers.group = GroupRenderer;
  viewRenderers.layout = LayoutRenderer;
}

registerViewRenderers();
