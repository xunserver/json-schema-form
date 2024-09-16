import type { FormAdapter } from "@form/react";
import type { FormEvent } from "react";

export const arcoReactFormAdapter: FormAdapter = {
  render(input) {
    return (
      <form
        id={input.ids.form}
        noValidate
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          input.submit();
        }}
      >
        {input.content}
      </form>
    );
  },
};
