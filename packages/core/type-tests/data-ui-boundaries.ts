import type {
  DataNode,
  ObjectDataNode,
  ScalarDataNode,
} from "../src/model/data.js";
import type {
  FieldDescriptor,
  FieldRequirementPresentation,
  FieldView,
  GroupView,
  ObjectView,
  ViewNode,
} from "../src/model/ui.js";

declare const data: DataNode;
declare const field: FieldDescriptor;
declare const view: ViewNode;

void data.id;
void field.dataNodeId;
void view.id;

type DataKeys = keyof DataNode;
type FieldKeys = keyof FieldDescriptor;
type RuntimeKeys = "values" | "touched" | "errors" | "transaction" | "component" | "onClick" | "focused";

type AssertDataClean = Extract<DataKeys, RuntimeKeys> extends never ? true : never;
type AssertFieldClean = Extract<FieldKeys, RuntimeKeys | "required" | "effectiveRequired"> extends never
  ? true
  : never;
const dataClean: AssertDataClean = true;
const fieldClean: AssertFieldClean = true;
void dataClean;
void fieldClean;

type AssertHasRequirement = "requirement" extends FieldKeys ? true : never;
const hasRequirement: AssertHasRequirement = true;
void hasRequirement;

declare const objectNode: ObjectDataNode;
declare const scalarNode: ScalarDataNode;
const kind: "object" | "scalar" = objectNode.kind;
void kind;
void scalarNode.nullable;

declare const objectView: ObjectView;
declare const groupView: GroupView;
declare const fieldView: FieldView;
void objectView.path;
void groupView.children;
void fieldView.fieldPath;

// @ts-expect-error FieldDescriptor is not a DataNode
const fieldAsData: DataNode = field;
void fieldAsData;

// @ts-expect-error DataNode is not a FieldDescriptor
const dataAsField: FieldDescriptor = data;
void dataAsField;

// @ts-expect-error ViewNode is not a DataNode
const viewAsData: DataNode = view;
void viewAsData;

// @ts-expect-error ObjectView is not a GroupView
const objectAsGroup: GroupView = objectView;
void objectAsGroup;

// @ts-expect-error FieldDescriptor does not include framework members
field.component = {};

// @ts-expect-error DataNode does not include runtime values
data.values = {};

declare const requirement: FieldRequirementPresentation;
const status: "required" | "optional" | "conditional" = requirement.status;
void status;

// @ts-expect-error requirement presentation is readonly
requirement.status = "optional";

// @ts-expect-error requirement presentation is not an instance boolean
requirement.required = true;
