import { compileForm } from "../compiler/compile-form.js";
import type { FormDefinition } from "../definition/form-definition.js";
import { createFormEnvironment } from "../extension/create-form-environment.js";
import type { CompiledFormModel } from "../model/compiled-form-model.js";
import type { CreateFormEngineOptions, FormEngine, FormInstance } from "../runtime/form/contracts.js";
import { createForm } from "../runtime/form/create-form.js";

export function createFormEngine(options?: CreateFormEngineOptions): FormEngine {
  const environment = createFormEnvironment({
    ...(options?.plugins === undefined ? {} : { plugins: options.plugins }),
    ...(options?.overrides === undefined ? {} : { overrides: options.overrides }),
  });

  const engine: FormEngine = {
    compile(definition: FormDefinition) {
      return compileForm(definition, { environment });
    },
    create(model: CompiledFormModel, createOptions?: { readonly initialValues?: unknown; readonly valueInitializer?: string }): FormInstance {
      return createForm(model, {
        environment,
        ...(createOptions?.initialValues === undefined ? {} : { initialValues: createOptions.initialValues }),
        ...(createOptions?.valueInitializer === undefined
          ? {}
          : { valueInitializer: createOptions.valueInitializer }),
      });
    },
  };

  return Object.freeze(engine);
}
