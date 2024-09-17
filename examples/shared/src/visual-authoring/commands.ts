import { visualDiagnostic, VISUAL_DIAGNOSTIC_CODES, type VisualEditorDiagnostic } from "./diagnostics.js";
import {
  cloneVisualDocument,
  collectFieldKeys,
  createPaletteNode,
  findNode,
  findParent,
  freezeVisualDocument,
  isContainerNode,
  isDescendant,
  isModelPathSafeKey,
  suggestedSelectionAfterRemove,
  type EditorNodeId,
  type LayoutVariant,
  type PaletteKind,
  type VisualContainerNode,
  type VisualDocument,
  type VisualFieldConstraints,
  type VisualFieldNode,
  type VisualGroupNode,
  type VisualIdAllocator,
  type VisualLayoutNode,
  type VisualNode,
  type VisualSchemaType,
  type VisualWidget,
} from "./model.js";

export type AddNodeCommand = {
  readonly type: "AddNode";
  readonly parentId: EditorNodeId;
  readonly index: number;
  readonly palette: PaletteKind;
};

export type RemoveNodeCommand = {
  readonly type: "RemoveNode";
  readonly nodeId: EditorNodeId;
};

export type MoveNodeCommand = {
  readonly type: "MoveNode";
  readonly nodeId: EditorNodeId;
  readonly targetParentId: EditorNodeId;
  readonly targetIndex: number;
};

export type UpdateFieldCommand = {
  readonly type: "UpdateField";
  readonly nodeId: EditorNodeId;
  readonly key: string;
  readonly title?: string;
  readonly description?: string;
  readonly required: boolean;
  readonly widget: VisualWidget;
  readonly schemaType: VisualSchemaType;
  readonly defaultValue?: unknown;
  readonly enumValues?: readonly string[];
  readonly constraints?: VisualFieldConstraints;
  readonly visible?: boolean;
  readonly disabled?: boolean;
  readonly readonly?: boolean;
  readonly span?: number;
};

export type UpdateGroupCommand = {
  readonly type: "UpdateGroup";
  readonly nodeId: EditorNodeId;
  readonly title?: string;
  readonly description?: string;
};

export type UpdateLayoutCommand = {
  readonly type: "UpdateLayout";
  readonly nodeId: EditorNodeId;
  readonly columns?: number;
  readonly span?: number;
};

export type VisualCommand =
  | AddNodeCommand
  | RemoveNodeCommand
  | MoveNodeCommand
  | UpdateFieldCommand
  | UpdateGroupCommand
  | UpdateLayoutCommand;

export type VisualReduceResult =
  | {
      readonly ok: true;
      readonly document: VisualDocument;
      readonly suggestedSelection: EditorNodeId;
    }
  | {
      readonly ok: false;
      readonly document: VisualDocument;
      readonly diagnostics: readonly VisualEditorDiagnostic[];
    };

export function reduceVisualDocument(
  document: VisualDocument,
  command: VisualCommand,
  allocator: VisualIdAllocator,
): VisualReduceResult {
  switch (command.type) {
    case "AddNode":
      return addNode(document, command, allocator);
    case "RemoveNode":
      return removeNode(document, command);
    case "MoveNode":
      return moveNode(document, command);
    case "UpdateField":
      return updateField(document, command);
    case "UpdateGroup":
      return updateGroup(document, command);
    case "UpdateLayout":
      return updateLayout(document, command);
  }
}

export function dragResultToCommand(input: {
  readonly source:
    | { readonly kind: "palette"; readonly palette: PaletteKind }
    | { readonly kind: "node"; readonly nodeId: EditorNodeId };
  readonly targetParentId: EditorNodeId;
  readonly targetIndex: number;
}): VisualCommand {
  if (input.source.kind === "palette") {
    return {
      type: "AddNode",
      parentId: input.targetParentId,
      index: input.targetIndex,
      palette: input.source.palette,
    };
  }
  return {
    type: "MoveNode",
    nodeId: input.source.nodeId,
    targetParentId: input.targetParentId,
    targetIndex: input.targetIndex,
  };
}

function fail(document: VisualDocument, diagnostics: readonly VisualEditorDiagnostic[]): VisualReduceResult {
  return { ok: false, document, diagnostics };
}

function succeed(next: VisualDocument, suggestedSelection: EditorNodeId): VisualReduceResult {
  return { ok: true, document: freezeVisualDocument(next), suggestedSelection };
}

function addNode(document: VisualDocument, command: AddNodeCommand, allocator: VisualIdAllocator): VisualReduceResult {
  const parent = findNode(document, command.parentId);
  if (parent === undefined || !isContainerNode(parent)) {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidTarget, "目标容器不存在或不能接收子节点", {
        nodeId: command.parentId,
      }),
    ]);
  }
  if (command.index < 0 || command.index > parent.children.length) {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidIndex, "插入位置越界", {
        nodeId: command.parentId,
        property: "index",
      }),
    ]);
  }
  const spanError = validateSpanForParent(parent, undefined);
  if (spanError !== undefined) {
    return fail(document, [spanError]);
  }
  const next = cloneVisualDocument(document);
  const nextParent = findNode(next, command.parentId);
  if (nextParent === undefined || !isContainerNode(nextParent)) {
    return fail(document, [visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "无法定位目标容器")]);
  }
  const created = createPaletteNode(command.palette, allocator, new Set(collectFieldKeys(document)));
  const children = [...nextParent.children];
  children.splice(command.index, 0, created);
  writeChildren(nextParent, children);
  return succeed(next, created.id);
}

function removeNode(document: VisualDocument, command: RemoveNodeCommand): VisualReduceResult {
  if (command.nodeId === document.root.id) {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidTarget, "不能删除根节点", { nodeId: command.nodeId }),
    ]);
  }
  const located = findParent(document, command.nodeId);
  if (located === undefined) {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "节点不存在", { nodeId: command.nodeId }),
    ]);
  }
  const next = cloneVisualDocument(document);
  const nextLocated = findParent(next, command.nodeId);
  if (nextLocated === undefined) {
    return fail(document, [visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "节点不存在")]);
  }
  const children = [...nextLocated.parent.children];
  children.splice(nextLocated.index, 1);
  writeChildren(nextLocated.parent, children);
  return succeed(next, suggestedSelectionAfterRemove(nextLocated.parent, nextLocated.index));
}

function moveNode(document: VisualDocument, command: MoveNodeCommand): VisualReduceResult {
  if (command.nodeId === document.root.id) {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidTarget, "不能移动根节点", { nodeId: command.nodeId }),
    ]);
  }
  const node = findNode(document, command.nodeId);
  if (node === undefined || node.kind === "root") {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "节点不存在", { nodeId: command.nodeId }),
    ]);
  }
  const source = findParent(document, command.nodeId);
  if (source === undefined) {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "找不到节点父容器", { nodeId: command.nodeId }),
    ]);
  }
  const targetParent = findNode(document, command.targetParentId);
  if (targetParent === undefined || !isContainerNode(targetParent)) {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidTarget, "目标不接受该节点", {
        nodeId: command.targetParentId,
      }),
    ]);
  }
  if (command.targetParentId === command.nodeId) {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.cycle, "不能把容器移入其自身", { nodeId: command.nodeId }),
    ]);
  }
  if ((node.kind === "group" || node.kind === "layout") && isDescendant(node, command.targetParentId)) {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.cycle, "不能把容器移入其后代", {
        nodeId: command.nodeId,
      }),
    ]);
  }
  const movingNode = node;
  const span = "span" in movingNode ? movingNode.span : undefined;
  const spanError = validateSpanForParent(targetParent, span);
  if (spanError !== undefined) {
    return fail(document, [{ ...spanError, nodeId: command.nodeId }]);
  }
  const sameParent = source.parent.id === targetParent.id;
  const lengthAfterRemove = sameParent ? targetParent.children.length - 1 : targetParent.children.length;
  if (command.targetIndex < 0 || command.targetIndex > lengthAfterRemove) {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidIndex, "移动位置越界", {
        nodeId: command.nodeId,
        property: "index",
      }),
    ]);
  }
  if (sameParent && command.targetIndex === source.index) {
    return { ok: true, document, suggestedSelection: command.nodeId };
  }

  const next = cloneVisualDocument(document);
  const nextSource = findParent(next, command.nodeId);
  if (nextSource === undefined) {
    return fail(document, [visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "移动失败")]);
  }
  const moving = nextSource.parent.children[nextSource.index];
  if (moving === undefined) {
    return fail(document, [visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "移动失败")]);
  }
  const fromChildren = [...nextSource.parent.children];
  fromChildren.splice(nextSource.index, 1);
  writeChildren(nextSource.parent, fromChildren);
  const resolvedTarget = findNode(next, command.targetParentId);
  if (resolvedTarget === undefined || !isContainerNode(resolvedTarget)) {
    return fail(document, [visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "移动失败")]);
  }
  const toChildren = [...resolvedTarget.children];
  if (command.targetIndex < 0 || command.targetIndex > toChildren.length) {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidIndex, "移动位置越界", { nodeId: command.nodeId }),
    ]);
  }
  toChildren.splice(command.targetIndex, 0, moving);
  writeChildren(resolvedTarget, toChildren);
  return succeed(next, command.nodeId);
}

function updateField(document: VisualDocument, command: UpdateFieldCommand): VisualReduceResult {
  const node = findNode(document, command.nodeId);
  if (node === undefined || node.kind !== "field") {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "字段节点不存在", { nodeId: command.nodeId }),
    ]);
  }
  const diagnostics = validateFieldCommand(document, command, node);
  if (diagnostics.length > 0) {
    return fail(document, diagnostics);
  }
  const next = cloneVisualDocument(document);
  const nextNode = findNode(next, command.nodeId);
  if (nextNode === undefined || nextNode.kind !== "field") {
    return fail(document, [visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "字段节点不存在")]);
  }
  const located = findParent(next, command.nodeId);
  if (located === undefined) {
    return fail(document, [visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "字段节点不存在")]);
  }
  const updated: VisualFieldNode = {
    id: nextNode.id,
    kind: "field",
    palette: paletteForWidget(command.widget),
    key: command.key,
    required: command.required,
    widget: command.widget,
    schemaType: command.schemaType,
    ...(command.title !== undefined && command.title !== "" ? { title: command.title } : {}),
    ...(command.description !== undefined && command.description !== ""
      ? { description: command.description }
      : {}),
    ...(command.defaultValue !== undefined ? { defaultValue: command.defaultValue } : {}),
    ...(command.enumValues !== undefined ? { enumValues: [...command.enumValues] } : {}),
    ...(command.constraints !== undefined ? { constraints: { ...command.constraints } } : {}),
    ...(command.visible !== undefined ? { visible: command.visible } : {}),
    ...(command.disabled !== undefined ? { disabled: command.disabled } : {}),
    ...(command.readonly !== undefined ? { readonly: command.readonly } : {}),
    ...(command.span !== undefined ? { span: command.span } : {}),
  };
  const children = [...located.parent.children];
  children[located.index] = updated;
  writeChildren(located.parent, children);
  return succeed(next, command.nodeId);
}

function updateGroup(document: VisualDocument, command: UpdateGroupCommand): VisualReduceResult {
  const node = findNode(document, command.nodeId);
  if (node === undefined || node.kind !== "group") {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidTarget, "只能更新 group 节点的标题和说明", {
        nodeId: command.nodeId,
      }),
    ]);
  }
  const next = cloneVisualDocument(document);
  const nextNode = findNode(next, command.nodeId);
  if (nextNode === undefined || nextNode.kind !== "group") {
    return fail(document, [visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "group 不存在")]);
  }
  const located = findParent(next, command.nodeId);
  if (located === undefined) {
    return fail(document, [visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "group 不存在")]);
  }
  const updated: VisualGroupNode = {
    id: nextNode.id,
    kind: "group",
    children: nextNode.children,
    ...(command.title !== undefined && command.title !== "" ? { title: command.title } : {}),
    ...(command.description !== undefined && command.description !== ""
      ? { description: command.description }
      : {}),
    ...(nextNode.span !== undefined ? { span: nextNode.span } : {}),
  };
  const children = [...located.parent.children];
  children[located.index] = updated;
  writeChildren(located.parent, children);
  return succeed(next, command.nodeId);
}

function updateLayout(document: VisualDocument, command: UpdateLayoutCommand): VisualReduceResult {
  const node = findNode(document, command.nodeId);
  if (node === undefined || node.kind !== "layout") {
    return fail(document, [
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidTarget, "只能更新 layout 节点的列配置", {
        nodeId: command.nodeId,
      }),
    ]);
  }
  const nextColumns = command.columns ?? node.columns;
  const columnsError = validateColumns(node.variant, nextColumns);
  if (columnsError !== undefined) {
    return fail(document, [{ ...columnsError, nodeId: command.nodeId, property: "columns" }]);
  }
  const parent = findParent(document, command.nodeId);
  const span = command.span ?? node.span;
  if (parent !== undefined) {
    const spanError = validateSpanForParent(parent.parent, span);
    if (spanError !== undefined) {
      return fail(document, [{ ...spanError, nodeId: command.nodeId, property: "span" }]);
    }
  }
  for (const child of node.children) {
    const childSpan = "span" in child ? child.span : undefined;
    if (childSpan !== undefined && childSpan > nextColumns) {
      return fail(document, [
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidSpan, "子节点 span 超出新的列数", {
          nodeId: child.id,
          property: "span",
        }),
      ]);
    }
  }
  const next = cloneVisualDocument(document);
  const nextNode = findNode(next, command.nodeId);
  if (nextNode === undefined || nextNode.kind !== "layout") {
    return fail(document, [visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "layout 不存在")]);
  }
  const located = findParent(next, command.nodeId);
  if (located === undefined) {
    return fail(document, [visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.missingNode, "layout 不存在")]);
  }
  const updated: VisualLayoutNode = {
    id: nextNode.id,
    kind: "layout",
    variant: variantForColumns(nextNode.variant, nextColumns),
    columns: nextColumns,
    children: nextNode.children,
    ...(span !== undefined ? { span } : {}),
  };
  const children = [...located.parent.children];
  children[located.index] = updated;
  writeChildren(located.parent, children);
  return succeed(next, command.nodeId);
}

function validateFieldCommand(
  document: VisualDocument,
  command: UpdateFieldCommand,
  current: VisualFieldNode,
): VisualEditorDiagnostic[] {
  const diagnostics: VisualEditorDiagnostic[] = [];
  if (!isModelPathSafeKey(command.key)) {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidKey, "字段 key 必须能无歧义形成 ModelPath", {
        nodeId: command.nodeId,
        property: "key",
      }),
    );
  }
  if (collectFieldKeys(document).some((key) => key === command.key) && current.key !== command.key) {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.duplicateKey, `字段 key "${command.key}" 已存在`, {
        nodeId: command.nodeId,
        property: "key",
      }),
    );
  }
  if (!widgetMatchesType(command.widget, command.schemaType)) {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidWidget, "Widget 与 JSON Schema 类型不兼容", {
        nodeId: command.nodeId,
        property: "widget",
      }),
    );
  }
  if (command.widget === "select") {
    const options = command.enumValues ?? [];
    if (options.length === 0 || options.some((item) => item.trim() === "")) {
      diagnostics.push(
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidEnum, "select 必须包含非空选项", {
          nodeId: command.nodeId,
          property: "enum",
        }),
      );
    }
  }
  if (command.defaultValue !== undefined) {
    const defaultError = validateDefault(command);
    if (defaultError !== undefined) {
      diagnostics.push(defaultError);
    }
  }
  if (command.constraints !== undefined) {
    diagnostics.push(...validateConstraints(command.nodeId, command.schemaType, command.constraints));
  }
  const parent = findParent(document, command.nodeId);
  if (parent !== undefined) {
    const spanError = validateSpanForParent(parent.parent, command.span);
    if (spanError !== undefined) {
      diagnostics.push({ ...spanError, nodeId: command.nodeId, property: "span" });
    }
  }
  return diagnostics;
}

function validateDefault(command: UpdateFieldCommand): VisualEditorDiagnostic | undefined {
  const value = command.defaultValue;
  if (command.schemaType === "string" && typeof value !== "string") {
    return visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidDefault, "default 必须是字符串", {
      nodeId: command.nodeId,
      property: "default",
    });
  }
  if (command.schemaType === "boolean" && typeof value !== "boolean") {
    return visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidDefault, "default 必须是布尔值", {
      nodeId: command.nodeId,
      property: "default",
    });
  }
  if (command.schemaType === "number" || command.schemaType === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidDefault, "default 必须是有限数字", {
        nodeId: command.nodeId,
        property: "default",
      });
    }
    if (command.schemaType === "integer" && !Number.isInteger(value)) {
      return visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidDefault, "integer 字段的 default 必须是整数", {
        nodeId: command.nodeId,
        property: "default",
      });
    }
  }
  if (command.widget === "select" && command.enumValues !== undefined && typeof value === "string") {
    if (!command.enumValues.includes(value)) {
      return visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidDefault, "default 必须是 enum 中的选项", {
        nodeId: command.nodeId,
        property: "default",
      });
    }
  }
  return undefined;
}

function validateConstraints(
  nodeId: EditorNodeId,
  schemaType: VisualSchemaType,
  constraints: VisualFieldConstraints,
): VisualEditorDiagnostic[] {
  const diagnostics: VisualEditorDiagnostic[] = [];
  const stringOnly = ["minLength", "maxLength", "pattern"] as const;
  const numberOnly = ["minimum", "maximum", "multipleOf"] as const;
  if (schemaType !== "string") {
    for (const key of stringOnly) {
      if (constraints[key] !== undefined) {
        diagnostics.push(
          visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidConstraint, `${key} 仅适用于 string`, {
            nodeId,
            property: key,
          }),
        );
      }
    }
  }
  if (schemaType !== "number" && schemaType !== "integer") {
    for (const key of numberOnly) {
      if (constraints[key] !== undefined) {
        diagnostics.push(
          visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidConstraint, `${key} 仅适用于 number/integer`, {
            nodeId,
            property: key,
          }),
        );
      }
    }
  }
  if (constraints.minLength !== undefined && (!Number.isInteger(constraints.minLength) || constraints.minLength < 0)) {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidConstraint, "minLength 必须是非负整数", {
        nodeId,
        property: "minLength",
      }),
    );
  }
  if (constraints.maxLength !== undefined && (!Number.isInteger(constraints.maxLength) || constraints.maxLength < 0)) {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidConstraint, "maxLength 必须是非负整数", {
        nodeId,
        property: "maxLength",
      }),
    );
  }
  if (
    constraints.minLength !== undefined &&
    constraints.maxLength !== undefined &&
    constraints.minLength > constraints.maxLength
  ) {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidConstraint, "minLength 不能大于 maxLength", {
        nodeId,
        property: "maxLength",
      }),
    );
  }
  if (constraints.pattern !== undefined) {
    try {
      new RegExp(constraints.pattern);
    } catch {
      diagnostics.push(
        visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidConstraint, "pattern 不是合法正则", {
          nodeId,
          property: "pattern",
        }),
      );
    }
  }
  if (constraints.minimum !== undefined && constraints.maximum !== undefined && constraints.minimum > constraints.maximum) {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidConstraint, "minimum 不能大于 maximum", {
        nodeId,
        property: "maximum",
      }),
    );
  }
  if (constraints.multipleOf !== undefined && (!(constraints.multipleOf > 0) || !Number.isFinite(constraints.multipleOf))) {
    diagnostics.push(
      visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidConstraint, "multipleOf 必须是正数", {
        nodeId,
        property: "multipleOf",
      }),
    );
  }
  return diagnostics;
}

function widgetMatchesType(widget: VisualWidget, schemaType: VisualSchemaType): boolean {
  switch (widget) {
    case "text":
    case "textarea":
    case "select":
      return schemaType === "string";
    case "number":
      return schemaType === "number" || schemaType === "integer";
    case "checkbox":
    case "switch":
      return schemaType === "boolean";
  }
}

function paletteForWidget(widget: VisualWidget): VisualFieldNode["palette"] {
  switch (widget) {
    case "text":
      return "text";
    case "textarea":
      return "textarea";
    case "number":
      return "number";
    case "checkbox":
    case "switch":
      return "boolean";
    case "select":
      return "select";
  }
}

function validateColumns(variant: LayoutVariant, columns: number): VisualEditorDiagnostic | undefined {
  if (!Number.isInteger(columns) || columns < 1) {
    return visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidColumns, "columns 必须是正整数");
  }
  if (variant === "stack" && columns !== 1) {
    return visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidColumns, "纵向 layout 的 columns 必须为 1");
  }
  if ((variant === "row" || variant === "grid") && columns < 2) {
    return visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidColumns, "横向/网格 layout 的 columns 必须大于 1");
  }
  return undefined;
}

function variantForColumns(current: LayoutVariant, columns: number): LayoutVariant {
  if (columns === 1) {
    return "stack";
  }
  if (current === "stack") {
    return "grid";
  }
  return current;
}

function validateSpanForParent(
  parent: VisualContainerNode,
  span: number | undefined,
): VisualEditorDiagnostic | undefined {
  if (span === undefined) {
    return undefined;
  }
  if (!Number.isInteger(span) || span < 1) {
    return visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidSpan, "span 必须是正整数");
  }
  if (parent.kind !== "layout") {
    return visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidSpan, "只有 layout 子节点可以设置 span");
  }
  if (span > parent.columns) {
    return visualDiagnostic(VISUAL_DIAGNOSTIC_CODES.invalidSpan, "span 不能超过父 layout 的 columns");
  }
  return undefined;
}

function writeChildren(container: VisualContainerNode, children: readonly VisualNode[]): void {
  (container as { children: readonly VisualNode[] }).children = children;
}

export function listValidMoveTargets(
  document: VisualDocument,
  nodeId: EditorNodeId,
): readonly { readonly parentId: EditorNodeId; readonly index: number }[] {
  const node = findNode(document, nodeId);
  if (node === undefined || node.kind === "root") {
    return [];
  }
  const targets: { readonly parentId: EditorNodeId; readonly index: number }[] = [];
  const visit = (container: VisualContainerNode): void => {
    if ((node.kind === "group" || node.kind === "layout") && isDescendant(node, container.id) && container.id !== document.root.id) {
      return;
    }
    if (container.id !== nodeId) {
      const same = findParent(document, nodeId);
      const childCount = container.children.length;
      const max = same?.parent.id === container.id ? childCount - 1 : childCount;
      for (let index = 0; index <= max; index += 1) {
        if (same?.parent.id === container.id && index === same.index) {
          continue;
        }
        const span = "span" in node ? node.span : undefined;
        if (validateSpanForParent(container, span) === undefined) {
          targets.push({ parentId: container.id, index });
        }
      }
    }
    for (const child of container.children) {
      if (child.kind !== "field" && child.id !== nodeId) {
        visit(child);
      }
    }
  };
  visit(document.root);
  return targets;
}
