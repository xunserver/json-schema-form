import type { ModelPathLike } from "../model/path/index.js";

export type WidgetName = string;
export type AdapterId = string;
export type WidgetProps = Readonly<Record<string, unknown>>;
export type NativeFieldOptions = Readonly<Record<string, unknown>>;

export interface FieldDisplay {
  readonly label?: string;
  readonly help?: string;
  readonly tooltip?: string;
  readonly labelMode?: string;
}

export interface FieldBehavior {
  readonly visible?: boolean;
  readonly disabled?: boolean;
  readonly readonly?: boolean;
}

export interface FieldUI {
  readonly field?: boolean;
  readonly widget?: WidgetName;
  readonly display?: FieldDisplay;
  readonly props?: WidgetProps;
  readonly behavior?: FieldBehavior;
  readonly native?: Readonly<Record<AdapterId, NativeFieldOptions>>;
}

export const LAYOUT_AUTHORING_KINDS = [
  "field",
  "object",
  "array",
  "group",
  "layout",
  "remaining-fields",
] as const;

export type LayoutAuthoringKind = (typeof LAYOUT_AUTHORING_KINDS)[number];

export interface LayoutNode {
  readonly type: LayoutAuthoringKind | (string & {});
  readonly path?: ModelPathLike;
  readonly children?: readonly LayoutNode[];
  readonly columns?: number;
  readonly span?: number;
}

export interface UISchema {
  readonly fields?: Readonly<Record<ModelPathLike, FieldUI>>;
  readonly layout?: LayoutNode;
}
