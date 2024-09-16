import type { ReactNode } from "react";
import type {
  ShadcnAdapterComponents,
  ShadcnCheckboxProps,
  ShadcnCollapsibleProps,
  ShadcnComboboxProps,
  ShadcnFieldDescriptionProps,
  ShadcnFieldErrorProps,
  ShadcnFieldGroupProps,
  ShadcnFieldLabelProps,
  ShadcnFieldProps,
  ShadcnInputProps,
  ShadcnSelectContentProps,
  ShadcnSelectGroupProps,
  ShadcnSelectItemProps,
  ShadcnSelectRootProps,
  ShadcnSelectTriggerProps,
  ShadcnSelectValueProps,
  ShadcnSwitchProps,
  ShadcnTextareaProps,
  ShadcnButtonProps,
} from "@xunserver-jsf/shadcn";

const controlClass =
  "flex h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive";

function Input(props: ShadcnInputProps) {
  return <input className={controlClass} {...props} />;
}

function Textarea(props: ShadcnTextareaProps) {
  return <textarea className={`${controlClass} min-h-16 py-2`} {...props} />;
}

function Checkbox(props: ShadcnCheckboxProps) {
  const { onCheckedChange, checked, ...rest } = props;
  return (
    <input
      type="checkbox"
      className="size-4"
      checked={checked === true}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...rest}
    />
  );
}

function Switch(props: ShadcnSwitchProps) {
  const { onCheckedChange, checked, ...rest } = props;
  return (
    <input
      type="checkbox"
      role="switch"
      className="size-4"
      checked={checked === true}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...rest}
    />
  );
}

function Button(props: ShadcnButtonProps) {
  return (
    <button
      type={props.type ?? "button"}
      disabled={props.disabled}
      onClick={props.onClick}
      className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-sm text-primary-foreground disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

function Select(props: ShadcnSelectRootProps) {
  const options: { value: string; label: string }[] = [];
  collectItems(props.children, options);
  let triggerProps: ShadcnSelectTriggerProps = {};
  walk(props.children, (node) => {
    if (isElement(node) && node.type === SelectTrigger) {
      triggerProps = node.props as ShadcnSelectTriggerProps;
    }
  });
  return (
    <select
      className={controlClass}
      value={props.value ?? ""}
      disabled={props.disabled}
      id={triggerProps.id}
      aria-labelledby={triggerProps["aria-labelledby"]}
      aria-describedby={triggerProps["aria-describedby"]}
      aria-invalid={triggerProps["aria-invalid"]}
      aria-required={triggerProps["aria-required"]}
      onFocus={triggerProps.onFocus}
      onBlur={triggerProps.onBlur}
      onChange={(event) => {
        props.onValueChange?.(event.target.value === "" ? null : event.target.value);
      }}
    >
      <option value="" />
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function SelectTrigger(_props: ShadcnSelectTriggerProps) {
  return null;
}

function SelectContent(props: ShadcnSelectContentProps) {
  return <>{props.children}</>;
}

function SelectGroup(props: ShadcnSelectGroupProps) {
  return <>{props.children}</>;
}

function SelectItem(props: ShadcnSelectItemProps) {
  return <>{props.children}</>;
}

function SelectValue(_props: ShadcnSelectValueProps) {
  return null;
}

function Combobox(props: ShadcnComboboxProps) {
  return (
    <select
      multiple
      className={`${controlClass} min-h-24 py-1`}
      id={props.id}
      disabled={props.disabled}
      value={[...props.value]}
      aria-labelledby={props["aria-labelledby"]}
      aria-describedby={props["aria-describedby"]}
      aria-invalid={props["aria-invalid"]}
      aria-required={props["aria-required"]}
      onChange={(event) => {
        props.onValueChange(Array.from(event.target.selectedOptions).map((option) => option.value));
      }}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Field(props: ShadcnFieldProps) {
  return (
    <div
      className="flex flex-col gap-1.5"
      data-invalid={props["data-invalid"]}
      data-disabled={props["data-disabled"]}
    >
      {props.children}
    </div>
  );
}

function FieldLabel(props: ShadcnFieldLabelProps) {
  return (
    <label id={props.id} htmlFor={props.htmlFor} className="text-sm font-medium">
      {props.children}
    </label>
  );
}

function FieldDescription(props: ShadcnFieldDescriptionProps) {
  return (
    <p id={props.id} className="text-sm text-muted-foreground">
      {props.children}
    </p>
  );
}

function FieldError(props: ShadcnFieldErrorProps) {
  return (
    <p id={props.id} role={props.role ?? "alert"} className="text-sm text-destructive">
      {props.children}
    </p>
  );
}

function FieldGroup(props: ShadcnFieldGroupProps) {
  return <div className="flex flex-col gap-4">{props.children}</div>;
}

function Collapsible(props: ShadcnCollapsibleProps) {
  return (
    <section className="rounded-lg border border-border p-3">
      <button
        type="button"
        className="mb-2 text-sm font-medium"
        onClick={() => props.onOpenChange(!props.open)}
      >
        {props.open ? "▾ " : "▸ "}
        {props.title}
      </button>
      {props.open ? <div className="flex flex-col gap-3">{props.children}</div> : null}
    </section>
  );
}

function walk(node: ReactNode, visit: (value: unknown) => void): void {
  if (node === null || node === undefined || typeof node === "boolean") {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child, visit);
    }
    return;
  }
  visit(node);
  if (isElement(node)) {
    walk(node.props.children as ReactNode, visit);
  }
}

function isElement(node: unknown): node is { type: unknown; props: Record<string, unknown> } {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    "props" in node &&
    typeof (node as { props: unknown }).props === "object"
  );
}

function collectItems(node: ReactNode, out: { value: string; label: string }[]): void {
  walk(node, (value) => {
    if (isElement(value) && value.type === SelectItem) {
      const itemProps = value.props as unknown as ShadcnSelectItemProps;
      out.push({
        value: itemProps.value,
        label: typeof itemProps.children === "string" ? itemProps.children : itemProps.value,
      });
    }
  });
}

export const previewShadcnComponents: ShadcnAdapterComponents = {
  Input,
  Textarea,
  Checkbox,
  Switch,
  Button,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectValue,
  Combobox,
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  Collapsible,
};
