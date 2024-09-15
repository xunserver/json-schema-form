import Box from "@mui/material/Box";
import type { FormAdapter } from "@form/react";
import type { FormEvent } from "react";

export const muiFormAdapter: FormAdapter = {
  render(input) {
    return (
      <Box
        component="form"
        id={input.ids.form}
        noValidate
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          input.submit();
        }}
      >
        {input.content}
      </Box>
    );
  },
};
