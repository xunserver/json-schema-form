import { useEffect, useMemo, useState } from "react";
import type {
  EditorNodeId,
  UpdateFieldCommand,
  UpdateLayoutCommand,
  VisualDocument,
  VisualEditorDiagnostic,
  VisualFieldNode,
  VisualLayoutNode,
  VisualSchemaType,
  VisualWidget,
} from "@xunserver-jsf/example-shared";
import { findNode, parentLayoutColumns } from "@xunserver-jsf/example-shared";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function PropertyInspector({
  document,
  selectedId,
  diagnostics,
  onApplyField,
  onApplyLayout,
  onCancel,
}: {
  readonly document: VisualDocument;
  readonly selectedId: EditorNodeId | null;
  readonly diagnostics: readonly VisualEditorDiagnostic[];
  readonly onApplyField: (command: UpdateFieldCommand) => void;
  readonly onApplyLayout: (command: UpdateLayoutCommand) => void;
  readonly onCancel: () => void;
}) {
  const node = selectedId === null ? undefined : findNode(document, selectedId);
  if (node === undefined || node.kind === "root") {
    return (
      <aside aria-label="属性检查器" data-testid="visual-inspector" className="p-3 text-sm text-muted-foreground">
        选择画布节点以配置字段或 layout。检查器不显示 Runtime values。
      </aside>
    );
  }
  if (node.kind === "group") {
    return (
      <aside aria-label="属性检查器" data-testid="visual-inspector" className="p-3 text-sm">
        <p className="font-medium">分组</p>
        <p className="text-muted-foreground">分组只改变呈现，不改变 JSON Schema 数据层级。</p>
      </aside>
    );
  }
  if (node.kind === "layout") {
    return (
      <LayoutInspector
        node={node}
        diagnostics={diagnostics}
        onApply={onApplyLayout}
        onCancel={onCancel}
      />
    );
  }
  return (
    <FieldInspector
      document={document}
      node={node}
      diagnostics={diagnostics}
      onApply={onApplyField}
      onCancel={onCancel}
    />
  );
}

function FieldInspector({
  document,
  node,
  diagnostics,
  onApply,
  onCancel,
}: {
  readonly document: VisualDocument;
  readonly node: VisualFieldNode;
  readonly diagnostics: readonly VisualEditorDiagnostic[];
  readonly onApply: (command: UpdateFieldCommand) => void;
  readonly onCancel: () => void;
}) {
  const [key, setKey] = useState(node.key);
  const [title, setTitle] = useState(node.title ?? "");
  const [description, setDescription] = useState(node.description ?? "");
  const [required, setRequired] = useState(node.required);
  const [widget, setWidget] = useState<VisualWidget>(node.widget);
  const [schemaType, setSchemaType] = useState<VisualSchemaType>(node.schemaType);
  const [enumText, setEnumText] = useState((node.enumValues ?? []).join("\n"));
  const [defaultText, setDefaultText] = useState(defaultToText(node.defaultValue));
  const [visible, setVisible] = useState(node.visible ?? true);
  const [spanText, setSpanText] = useState(node.span === undefined ? "" : String(node.span));

  useEffect(() => {
    setKey(node.key);
    setTitle(node.title ?? "");
    setDescription(node.description ?? "");
    setRequired(node.required);
    setWidget(node.widget);
    setSchemaType(node.schemaType);
    setEnumText((node.enumValues ?? []).join("\n"));
    setDefaultText(defaultToText(node.defaultValue));
    setVisible(node.visible ?? true);
    setSpanText(node.span === undefined ? "" : String(node.span));
  }, [node]);

  const errors = useMemo(() => errorsByProperty(diagnostics, node.id), [diagnostics, node.id]);
  const layoutColumns = parentLayoutColumns(document, node.id);

  return (
    <aside aria-label="属性检查器" data-testid="visual-inspector" className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-3">
      <p className="text-sm font-medium">字段配置</p>
      <Field>
        <FieldLabel htmlFor="visual-field-key">key</FieldLabel>
        <Input
          id="visual-field-key"
          value={key}
          aria-invalid={errors.key !== undefined}
          aria-describedby={errors.key !== undefined ? "visual-field-key-error" : undefined}
          onChange={(event) => setKey(event.target.value)}
        />
        <FieldError id="visual-field-key-error" message={errors.key} />
      </Field>
      <Field>
        <FieldLabel htmlFor="visual-field-title">标题</FieldLabel>
        <Input id="visual-field-title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="visual-field-description">说明</FieldLabel>
        <Textarea id="visual-field-description" value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} />
        必填（写入 Schema required）
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
        初始可见
      </label>
      <Field>
        <FieldLabel htmlFor="visual-field-widget">Widget</FieldLabel>
        <select
          id="visual-field-widget"
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={widget}
          onChange={(event) => setWidget(event.target.value as VisualWidget)}
        >
          <option value="text">text</option>
          <option value="textarea">textarea</option>
          <option value="number">number</option>
          <option value="checkbox">checkbox</option>
          <option value="switch">switch</option>
          <option value="select">select</option>
        </select>
      </Field>
      <Field>
        <FieldLabel htmlFor="visual-field-type">类型</FieldLabel>
        <select
          id="visual-field-type"
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          value={schemaType}
          onChange={(event) => setSchemaType(event.target.value as VisualSchemaType)}
        >
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="integer">integer</option>
          <option value="boolean">boolean</option>
        </select>
      </Field>
      {widget === "select" ? (
        <Field>
          <FieldLabel htmlFor="visual-field-enum">选项（每行一个）</FieldLabel>
          <Textarea
            id="visual-field-enum"
            value={enumText}
            aria-invalid={errors.enum !== undefined}
            aria-describedby={errors.enum !== undefined ? "visual-field-enum-error" : undefined}
            onChange={(event) => setEnumText(event.target.value)}
          />
          <FieldError id="visual-field-enum-error" message={errors.enum} />
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor="visual-field-default">默认值</FieldLabel>
        <Input
          id="visual-field-default"
          value={defaultText}
          aria-invalid={errors.default !== undefined}
          aria-describedby={errors.default !== undefined ? "visual-field-default-error" : undefined}
          onChange={(event) => setDefaultText(event.target.value)}
        />
        <FieldError id="visual-field-default-error" message={errors.default} />
      </Field>
      {layoutColumns !== undefined ? (
        <Field>
          <FieldLabel htmlFor="visual-field-span">span</FieldLabel>
          <Input
            id="visual-field-span"
            value={spanText}
            aria-invalid={errors.span !== undefined}
            aria-describedby={errors.span !== undefined ? "visual-field-span-error" : undefined}
            onChange={(event) => setSpanText(event.target.value)}
          />
          <FieldError id="visual-field-span-error" message={errors.span} />
        </Field>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => {
            const command: UpdateFieldCommand = {
              type: "UpdateField",
              nodeId: node.id,
              key,
              required,
              widget,
              schemaType,
              ...(title.trim() !== "" ? { title: title.trim() } : {}),
              ...(description.trim() !== "" ? { description: description.trim() } : {}),
              ...(widget === "select" ? { enumValues: enumText.split("\n").map((item) => item.trim()).filter(Boolean) } : {}),
              ...(defaultText !== "" ? { defaultValue: parseDefault(schemaType, defaultText) } : {}),
              ...(visible === false ? { visible: false } : visible === true && node.visible !== undefined ? { visible: true } : {}),
              ...(spanText !== "" ? { span: Number(spanText) } : {}),
            };
            onApply(command);
          }}
        >
          应用
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </aside>
  );
}

function LayoutInspector({
  node,
  diagnostics,
  onApply,
  onCancel,
}: {
  readonly node: VisualLayoutNode;
  readonly diagnostics: readonly VisualEditorDiagnostic[];
  readonly onApply: (command: UpdateLayoutCommand) => void;
  readonly onCancel: () => void;
}) {
  const [columns, setColumns] = useState(String(node.columns));
  const [spanText, setSpanText] = useState(node.span === undefined ? "" : String(node.span));
  useEffect(() => {
    setColumns(String(node.columns));
    setSpanText(node.span === undefined ? "" : String(node.span));
  }, [node]);
  const errors = useMemo(() => errorsByProperty(diagnostics, node.id), [diagnostics, node.id]);
  return (
    <aside aria-label="属性检查器" data-testid="visual-inspector" className="flex flex-col gap-3 p-3">
      <p className="text-sm font-medium">Layout 配置</p>
      <Field>
        <FieldLabel htmlFor="visual-layout-columns">columns</FieldLabel>
        <Input
          id="visual-layout-columns"
          value={columns}
          disabled={node.variant === "stack"}
          aria-invalid={errors.columns !== undefined}
          aria-describedby={errors.columns !== undefined ? "visual-layout-columns-error" : undefined}
          onChange={(event) => setColumns(event.target.value)}
        />
        <FieldError id="visual-layout-columns-error" message={errors.columns} />
      </Field>
      <Field>
        <FieldLabel htmlFor="visual-layout-span">span</FieldLabel>
        <Input
          id="visual-layout-span"
          value={spanText}
          aria-invalid={errors.span !== undefined}
          aria-describedby={errors.span !== undefined ? "visual-layout-span-error" : undefined}
          onChange={(event) => setSpanText(event.target.value)}
        />
        <FieldError id="visual-layout-span-error" message={errors.span} />
      </Field>
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() =>
            onApply({
              type: "UpdateLayout",
              nodeId: node.id,
              columns: Number(columns),
              ...(spanText !== "" ? { span: Number(spanText) } : {}),
            })
          }
        >
          应用
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </aside>
  );
}

function FieldError({ id, message }: { readonly id: string; readonly message: string | undefined }) {
  if (message === undefined) {
    return null;
  }
  return (
    <p id={id} role="alert" className="text-destructive text-xs">
      {message}
    </p>
  );
}

function errorsByProperty(
  diagnostics: readonly VisualEditorDiagnostic[],
  nodeId: EditorNodeId,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const diagnostic of diagnostics) {
    if (diagnostic.nodeId === nodeId && diagnostic.property !== undefined) {
      result[diagnostic.property] = diagnostic.message;
    }
  }
  return result;
}

function defaultToText(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function parseDefault(schemaType: VisualSchemaType, text: string): unknown {
  if (schemaType === "boolean") {
    return text === "true";
  }
  if (schemaType === "number" || schemaType === "integer") {
    return Number(text);
  }
  return text;
}
