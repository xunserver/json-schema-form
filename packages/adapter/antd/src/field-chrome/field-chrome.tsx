import { Form } from "antd";
import type { FieldChromeAdapter } from "@form/react";

export const antdFieldChrome: FieldChromeAdapter = {
  render(input) {
    const label = input.field.display?.label;
    const help = input.field.display?.help;
    const hasError = input.presentableErrors.length > 0;
    return (
      <Form.Item
        label={
          <span id={input.ids.label}>
            {label ?? ""}
            {input.fieldSnapshot.validating ? " (validating)" : ""}
          </span>
        }
        required={input.fieldSnapshot.required}
        {...(hasError ? { validateStatus: "error" as const } : {})}
        {...(help === undefined ? {} : { extra: <span id={input.ids.help}>{help}</span> })}
      >
        {input.control}
        {input.presentableErrors.map((error, index) => (
          <div key={`${error.code}:${index}`} id={input.ids.errors[index]} role="alert">
            {error.message ?? error.code}
          </div>
        ))}
      </Form.Item>
    );
  },
};
