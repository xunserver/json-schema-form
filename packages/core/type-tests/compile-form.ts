import { compileForm, defineForm } from "../src/index.js";
import type { CompileOptions, CompileResult } from "../src/index.js";
import { createFormEnvironment } from "../src/extension/index.js";

const definition = defineForm({
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
    },
  },
});

const defaultResult: CompileResult = compileForm(definition);
void defaultResult.model.data.root.kind;
void defaultResult.diagnostics;

const environment = createFormEnvironment();
const options: CompileOptions = { environment };
const explicitResult = compileForm(definition, options);
void explicitResult.model.ui.fields;

compileForm(definition, {});

type OptionsKeys = keyof CompileOptions;
type AssertOnlyEnvironment = Exclude<OptionsKeys, "environment"> extends never ? true : never;
const onlyEnvironment: AssertOnlyEnvironment = true;
void onlyEnvironment;
