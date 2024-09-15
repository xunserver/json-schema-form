import type { AdapterId, FieldBehavior, FieldDisplay, WidgetProps } from "../definition/ui-schema.js";
import type { DataNodeId, ViewNodeId } from "../identity/index.js";
import type { ModelPath } from "../path/index.js";
import type { NativeFieldOptions } from "../definition/ui-schema.js";
import type { ReadonlyKeyedCollection } from "./readonly-collection.js";

export interface FieldDescriptor {
  readonly dataNodeId: DataNodeId;
  readonly path: ModelPath;
  readonly widget: string;
  readonly display?: FieldDisplay;
  readonly props?: WidgetProps;
  readonly behavior?: FieldBehavior;
  readonly native?: Readonly<Record<AdapterId, NativeFieldOptions>>;
}

export type ViewNodeKind = "field" | "object" | "array" | "group" | "layout";

export interface ViewNodeBase {
  readonly id: ViewNodeId;
  readonly kind: ViewNodeKind;
}

export interface FieldView extends ViewNodeBase {
  readonly kind: "field";
  readonly fieldPath: ModelPath;
}

export interface ObjectView extends ViewNodeBase {
  readonly kind: "object";
  readonly path: ModelPath;
  readonly children: readonly ViewNode[];
}

export interface ArrayView extends ViewNodeBase {
  readonly kind: "array";
  readonly path: ModelPath;
  readonly itemLayout: readonly ViewNode[];
}

export interface GroupView extends ViewNodeBase {
  readonly kind: "group";
  readonly children: readonly ViewNode[];
}

export interface LayoutView extends ViewNodeBase {
  readonly kind: "layout";
  readonly columns?: number;
  readonly span?: number;
  readonly children: readonly ViewNode[];
}

export type ViewNode = FieldView | ObjectView | ArrayView | GroupView | LayoutView;

export interface UIModel {
  readonly fields: ReadonlyKeyedCollection<ModelPath, FieldDescriptor>;
  readonly viewTree: ViewNode;
}
