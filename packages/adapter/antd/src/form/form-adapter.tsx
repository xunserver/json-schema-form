import type { FormAdapter } from "@xunserver-jsf/react";
import type { FormEvent } from "react";

export const antdFormAdapter: FormAdapter = {
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
