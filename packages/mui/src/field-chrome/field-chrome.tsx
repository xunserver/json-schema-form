import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import type { FieldChromeAdapter } from "@form/react";

export const muiFieldChrome: FieldChromeAdapter = {
  render(input) {
    const label = input.field.display?.label;
    const help = input.field.display?.help;
    return (
      <FormControl
        error={input.presentableErrors.length > 0}
        disabled={input.fieldSnapshot.disabled}
        required={input.fieldSnapshot.required}
        fullWidth
      >
        <FormLabel id={input.ids.label}>
          {label ?? ""}
          {input.fieldSnapshot.validating ? " (validating)" : ""}
        </FormLabel>
        {input.control}
        {help === undefined ? null : <FormHelperText id={input.ids.help}>{help}</FormHelperText>}
        {input.presentableErrors.map((error, index) => (
          <FormHelperText key={`${error.code}:${index}`} id={input.ids.errors[index]} error>
            {error.message ?? error.code}
          </FormHelperText>
        ))}
      </FormControl>
    );
  },
};
