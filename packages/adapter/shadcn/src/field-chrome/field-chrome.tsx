import type { FieldChromeAdapter } from "@form/react";
import type { ShadcnAdapterComponents } from "../components.js";

export function createShadcnFieldChrome(components: ShadcnAdapterComponents): FieldChromeAdapter {
  const { Field, FieldLabel, FieldDescription, FieldError, FieldGroup } = components;
  return {
    render(input) {
      const label = input.field.display?.label;
      const help = input.field.display?.help;
      const hasError = input.presentableErrors.length > 0;
      return (
        <FieldGroup>
          <Field
            {...(hasError ? { "data-invalid": true as const } : {})}
            {...(input.fieldSnapshot.disabled ? { "data-disabled": true as const } : {})}
          >
            <FieldLabel id={input.ids.label} htmlFor={input.ids.control}>
              {label ?? ""}
              {input.fieldSnapshot.required ? " *" : ""}
              {input.fieldSnapshot.validating ? " (validating)" : ""}
            </FieldLabel>
            {input.control}
            {help === undefined ? null : (
              <FieldDescription id={input.ids.help}>{help}</FieldDescription>
            )}
            {input.presentableErrors.map((error, index) => {
              const errorId = input.ids.errors[index];
              return (
                <FieldError
                  key={`${error.code}:${index}`}
                  {...(errorId === undefined ? {} : { id: errorId })}
                  role="alert"
                >
                  {error.message ?? error.code}
                </FieldError>
              );
            })}
          </Field>
        </FieldGroup>
      );
    },
  };
}
