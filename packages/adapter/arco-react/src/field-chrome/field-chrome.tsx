import { Form } from "@arco-design/web-react";
import type { FieldChromeAdapter } from "@xunserver-jsf/react";

export const arcoReactFieldChrome: FieldChromeAdapter = {
  render(input) {
    const label = input.field.display?.label;
    const help = input.field.display?.help;
    const validateStatus =
      input.presentableErrors.length > 0
        ? ("error" as const)
        : input.fieldSnapshot.validating
          ? ("validating" as const)
          : undefined;
    return (
      <Form.Item
        required={input.fieldSnapshot.required}
        disabled={input.fieldSnapshot.disabled}
        {...(validateStatus === undefined ? {} : { validateStatus })}
        label={
          <span id={input.ids.label}>
            {label ?? ""}
            {input.fieldSnapshot.validating ? " (validating)" : ""}
          </span>
        }
      >
        {input.control}
        {help === undefined ? null : (
          <div id={input.ids.help} style={{ marginTop: 4, color: "var(--color-text-3)", fontSize: 12 }}>
            {help}
          </div>
        )}
        {input.presentableErrors.map((error, index) => (
          <div
            key={`${error.code}:${index}`}
            id={input.ids.errors[index]}
            role="alert"
            style={{ marginTop: 4, color: "rgb(var(--red-6))", fontSize: 12 }}
          >
            {error.message ?? error.code}
          </div>
        ))}
      </Form.Item>
    );
  },
};
