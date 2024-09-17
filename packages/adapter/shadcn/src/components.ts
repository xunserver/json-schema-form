import type { ComponentType, ReactNode } from "react";

/** Shared ARIA / control props the adapter may pass to injected controls. */
export interface ShadcnControlAriaProps {
  readonly id?: string;
  readonly disabled?: boolean;
  readonly "aria-labelledby"?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: boolean;
  readonly "aria-required"?: boolean;
}

export interface ShadcnInputProps extends ShadcnControlAriaProps {
  readonly value?: string | number;
  readonly type?: string;
  readonly readOnly?: boolean;
  readonly onChange?: (event: { readonly target: { readonly value: string } }) => void;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly className?: string;
}

export interface ShadcnTextareaProps extends ShadcnControlAriaProps {
  readonly value?: string;
  readonly rows?: number;
  readonly readOnly?: boolean;
  readonly onChange?: (event: { readonly target: { readonly value: string } }) => void;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly className?: string;
}

export interface ShadcnCheckboxProps extends ShadcnControlAriaProps {
  readonly checked?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly className?: string;
}

export interface ShadcnSwitchProps extends ShadcnControlAriaProps {
  readonly checked?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
  readonly className?: string;
}

export interface ShadcnButtonProps {
  readonly type?: "button" | "submit" | "reset";
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly children?: ReactNode;
  readonly className?: string;
}

export interface ShadcnSelectRootProps {
  readonly value?: string | null;
  readonly onValueChange?: (value: string | null) => void;
  readonly disabled?: boolean;
  readonly children?: ReactNode;
}

export interface ShadcnSelectTriggerProps extends ShadcnControlAriaProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
}

export interface ShadcnSelectContentProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

export interface ShadcnSelectItemProps {
  readonly value: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

export interface ShadcnSelectGroupProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

export interface ShadcnSelectValueProps {
  readonly placeholder?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

export interface ShadcnComboboxOption {
  readonly value: string;
  readonly label: string;
}

export interface ShadcnComboboxProps extends ShadcnControlAriaProps {
  readonly value: readonly string[];
  readonly onValueChange: (value: string[]) => void;
  readonly options: readonly ShadcnComboboxOption[];
  readonly className?: string;
}

export interface ShadcnFieldProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly "data-invalid"?: boolean | "";
  readonly "data-disabled"?: boolean | "";
}

export interface ShadcnFieldLabelProps {
  readonly id?: string;
  readonly htmlFor?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

export interface ShadcnFieldDescriptionProps {
  readonly id?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

export interface ShadcnFieldErrorProps {
  readonly id?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly role?: string;
}

export interface ShadcnFieldGroupProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

export interface ShadcnCardProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly title?: string;
  readonly description?: string;
  readonly "data-layout"?: string;
}

/**
 * Structural slot map. Official shadcn base-nova components should satisfy these
 * shapes; the adapter never imports `@/components/ui/*` or `@base-ui/react`.
 */
export interface ShadcnAdapterComponents {
  readonly Input: ComponentType<ShadcnInputProps>;
  readonly Textarea: ComponentType<ShadcnTextareaProps>;
  readonly Checkbox: ComponentType<ShadcnCheckboxProps>;
  readonly Switch: ComponentType<ShadcnSwitchProps>;
  readonly Button: ComponentType<ShadcnButtonProps>;
  readonly Select: ComponentType<ShadcnSelectRootProps>;
  readonly SelectTrigger: ComponentType<ShadcnSelectTriggerProps>;
  readonly SelectContent: ComponentType<ShadcnSelectContentProps>;
  readonly SelectItem: ComponentType<ShadcnSelectItemProps>;
  readonly SelectGroup: ComponentType<ShadcnSelectGroupProps>;
  readonly SelectValue: ComponentType<ShadcnSelectValueProps>;
  readonly Combobox: ComponentType<ShadcnComboboxProps>;
  readonly Field: ComponentType<ShadcnFieldProps>;
  readonly FieldLabel: ComponentType<ShadcnFieldLabelProps>;
  readonly FieldDescription: ComponentType<ShadcnFieldDescriptionProps>;
  readonly FieldError: ComponentType<ShadcnFieldErrorProps>;
  readonly FieldGroup: ComponentType<ShadcnFieldGroupProps>;
  readonly Card: ComponentType<ShadcnCardProps>;
}

export const REQUIRED_SHADCN_SLOTS = Object.freeze([
  "Input",
  "Textarea",
  "Checkbox",
  "Switch",
  "Button",
  "Select",
  "SelectTrigger",
  "SelectContent",
  "SelectItem",
  "SelectGroup",
  "SelectValue",
  "Combobox",
  "Field",
  "FieldLabel",
  "FieldDescription",
  "FieldError",
  "FieldGroup",
  "Card",
] as const satisfies readonly (keyof ShadcnAdapterComponents)[]);

export type RequiredShadcnSlot = (typeof REQUIRED_SHADCN_SLOTS)[number];
