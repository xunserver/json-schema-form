import { compileForm, createForm, defineForm, type FormInstance } from "@xunserver-jsf/core";
import type { UISchema } from "@xunserver-jsf/core";

export function createPersonForm(initialValues?: unknown, uiSchema?: UISchema): FormInstance {
  return createForm(
    compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
            secret: { type: "string" },
          },
        },
        ...(uiSchema === undefined ? {} : { uiSchema }),
      }),
    ).model,
    { initialValues: initialValues ?? { name: "Ada", age: 36, secret: "s" } },
  );
}

export function createArrayForm(): FormInstance {
  return createForm(
    compileForm(
      defineForm({
        schema: {
          type: "object",
          properties: {
            products: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  sku: { type: "string" },
                },
              },
            },
          },
        },
      }),
    ).model,
    {
      initialValues: {
        products: [
          { name: "A", sku: "a" },
          { name: "B", sku: "b" },
          { name: "C", sku: "c" },
        ],
      },
    },
  );
}
