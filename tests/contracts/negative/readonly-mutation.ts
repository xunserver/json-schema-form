import type { CompiledFormModel } from "@form/core";

declare const model: CompiledFormModel;

model.data = model.data;
model.diagnostics.push({
  code: "x",
  severity: "error",
  message: "no",
  source: "compiler",
});
