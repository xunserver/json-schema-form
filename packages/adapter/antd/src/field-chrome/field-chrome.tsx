import { Form } from "antd";
import type { CSSProperties } from "react";
import type { FieldChromeAdapter } from "@xunserver-jsf/react";

const HELP_STYLE: CSSProperties = Object.freeze({
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
});

export const antdFieldChrome: FieldChromeAdapter = {
  render(input) {
    const label = input.field.display?.label;
    const help = input.field.display?.help;
    const hasError = input.presentableErrors.length > 0;
    const status = input.fieldSnapshot.validating
      ? ("validating" as const)
      : hasError
        ? ("error" as const)
        : undefined;
    const errorNodes = input.presentableErrors.map((error, index) => (
      <div key={`${error.code}:${index}`} id={input.ids.errors[index]} role="alert">
        {error.message ?? error.code}
      </div>
    ));
    return (
      <Form.Item
        layout="vertical"
        htmlFor={input.ids.control}
        label={
          <span id={input.ids.label}>
            {label ?? ""}
            {input.fieldSnapshot.validating ? " (validating)" : ""}
          </span>
        }
        required={input.fieldSnapshot.required}
        {...(status === undefined ? {} : { validateStatus: status })}
        {...(hasError ? { help: errorNodes } : {})}
        {...(help === undefined
          ? {}
          : { extra: <span id={input.ids.help} style={HELP_STYLE}>{help}</span> })}
      >
        {input.control}
      </Form.Item>
    );
  },
};
