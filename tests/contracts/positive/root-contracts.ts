import type {
  CompiledFormModel,
  CompileResult,
  Diagnostic,
  FormDefinition,
  JsonSchema,
} from "@xunserver-jsf/core";
import { CompileError, defineForm } from "@xunserver-jsf/core";

export const schema: JsonSchema = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
      },
    },
  },
};

export const definition: FormDefinition = defineForm({ schema });

export type InspectedModel = Pick<
  CompiledFormModel,
  "data" | "ui" | "rule" | "validation" | "schemaDynamics" | "diagnostics"
>;

export function inspectResult(result: CompileResult, diagnostic: Diagnostic): CompileResult["model"] {
  void diagnostic.code;
  return result.model;
}

export function isCompileError(error: unknown): error is CompileError {
  return error instanceof CompileError;
}
