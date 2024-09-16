import type { FormAdapter } from "@xunserver-jsf/react";
import type { FormEvent } from "react";
import { Form } from "@arco-design/web-react";

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
        <Form wrapper="div" layout="vertical" labelAlign="left">
          {input.content}
        </Form>
      </form>
    );
  },
};
