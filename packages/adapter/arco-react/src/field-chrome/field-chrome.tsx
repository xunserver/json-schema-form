import { Form } from "@arco-design/web-react";
import type { CSSProperties } from "react";
import type { FieldChromeAdapter } from "@xunserver-jsf/react";

const HELP_STYLE: CSSProperties = Object.freeze({
  margin: 0,
  fontSize: 12,
  lineHeight: 1.5,
});

export const arcoReactFieldChrome: FieldChromeAdapter = {
  render(input) {
    const label = input.field.display?.label;
    const help = input.field.display?.help;
    const hasError = input.presentableErrors.length > 0;
    const validateStatus = input.fieldSnapshot.validating
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
        required={input.fieldSnapshot.required}
        hasFeedback={false}
        {...(validateStatus === undefined ? {} : { validateStatus })}
        label={
          <span id={input.ids.label}>
            {label ?? ""}
            {input.fieldSnapshot.validating ? " (validating)" : ""}
          </span>
        }
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
